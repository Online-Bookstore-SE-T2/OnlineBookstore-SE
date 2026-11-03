const mongoose = require('mongoose');
const {
  User,
  Category,
  Book,
  Listing,
  Review,
  Order,
  ListingRemovalRequest,
} = require('../models');
const {
  ROLES,
  ACCOUNT_STATUS,
  SELLER_REQUEST_STATUS,
  REJECT_REASON_CODES,
  OPEN_ORDER_STATUSES,
  ORDER_STATUS,
  LISTING_STATUS,
  LISTING_REMOVAL_STATUS,
} = require('../constants');
const strings = require('../resources/strings');
const { AppError } = require('../utils/errors');
const {
  FieldValidator,
  LIMITS,
  sanitizeText,
  characterCount,
} = require('../validation/validators');
const { isWithinRetention } = require('../models/plugins/softDelete');
const audit = require('./auditService');
const orderService = require('./orderService');
const { recomputeBookRating } = require('./ratingService');

const PAGE_SIZE = 20;
const { trusted } = mongoose;

// REQ-4: the seven kinds of record an administrator can view, suspend and delete.
// `label` gives the readable name stored in the audit log; `search` lists text-searchable fields.
const ENTITIES = {
  users: {
    model: User,
    type: 'User',
    search: ['name', 'email'],
    filters: { role: Object.values(ROLES), status: Object.values(ACCOUNT_STATUS) },
    label: (doc) => doc.name,
  },
  books: {
    model: Book,
    type: 'Book',
    search: ['title', 'author', 'isbn'],
    populate: [{ path: 'category', select: 'name' }],
    label: (doc) => doc.title,
  },
  categories: { model: Category, type: 'Category', search: ['name'], label: (doc) => doc.name },
  listings: {
    model: Listing,
    type: 'Listing',
    filters: { status: Object.values(LISTING_STATUS) },
    populate: [
      { path: 'book', select: 'title isbn' },
      { path: 'seller', select: 'name' },
    ],
    label: (doc) => `Listing ${doc.id}`,
  },
  reviews: {
    model: Review,
    type: 'Review',
    search: ['text'],
    populate: [
      { path: 'book', select: 'title' },
      { path: 'user', select: 'name' },
    ],
    label: (doc) => `Review ${doc.id}`,
  },
  orders: {
    model: Order,
    type: 'Order',
    populate: [
      { path: 'buyer', select: 'name' },
      { path: 'items.book', select: 'title isbn' },
      { path: 'items.seller', select: 'name' },
    ],
    label: (doc) => `Order ${doc.id}`,
  },
};

function entityConfig(entity) {
  const config = Object.prototype.hasOwnProperty.call(ENTITIES, entity) ? ENTITIES[entity] : null;
  if (!config) throw new AppError(404, strings.admin.unknownEntity);
  return config;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pageNumber(value) {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

// Builds the list filter from the request body. Operators are created here on the server and
// marked trusted; user input only ever supplies plain strings (SRS 6.3).
function buildFilter(config, query) {
  const filter = { deletedAt: query.deleted === true ? trusted({ $ne: null }) : null };
  for (const [field, allowed] of Object.entries(config.filters || {})) {
    if (typeof query[field] === 'string' && allowed.includes(query[field])) filter[field] = query[field];
  }
  if (config.search && typeof query.q === 'string' && query.q.trim() !== '') {
    const pattern = escapeRegex(query.q.trim().slice(0, 100));
    filter.$or = config.search.map((field) => ({ [field]: trusted({ $regex: pattern, $options: 'i' }) }));
  }
  return filter;
}

// Lists one page (20 records) of an entity, newest first. Deleted records are listed only on request.
async function listRecords(entity, query = {}) {
  const config = entityConfig(entity);
  const page = pageNumber(query.page);
  const filter = buildFilter(config, query);
  const [items, total] = await Promise.all([
    config.model
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .populate(config.populate || []),
    config.model.countDocuments(filter),
  ]);
  return { items, page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

// REQ-4: return only the names and transaction fields specified by Appendix B.
async function listOrderTransactionReport(query = {}) {
  const page = pageNumber(query.page);
  const offset = (page - 1) * PAGE_SIZE;
  const [result] = await Order.aggregate([
    { $match: { deletedAt: null } },
    { $unwind: '$items' },
    {
      $lookup: {
        from: User.collection.name,
        localField: 'buyer',
        foreignField: '_id',
        pipeline: [{ $project: { _id: 0, name: 1 } }],
        as: 'buyer',
      },
    },
    { $unwind: { path: '$buyer', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: User.collection.name,
        localField: 'items.seller',
        foreignField: '_id',
        pipeline: [{ $project: { _id: 0, name: 1 } }],
        as: 'seller',
      },
    },
    { $unwind: { path: '$seller', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: Book.collection.name,
        localField: 'items.book',
        foreignField: '_id',
        pipeline: [{ $project: { _id: 0, isbn: 1 } }],
        as: 'book',
      },
    },
    { $unwind: { path: '$book', preserveNullAndEmptyArrays: true } },
    { $sort: { createdAt: -1, _id: -1, 'items.title': 1 } },
    {
      $facet: {
        items: [
          { $skip: offset },
          { $limit: PAGE_SIZE },
          {
            $project: {
              _id: 0,
              transactionRef: { $ifNull: ['$payment.transactionRef', '-'] },
              orderId: { $toString: '$_id' },
              buyerName: { $ifNull: ['$buyer.name', '-'] },
              sellerName: { $ifNull: ['$seller.name', '-'] },
              bookTitle: '$items.title',
              isbn: { $ifNull: ['$items.isbn', { $ifNull: ['$book.isbn', '-'] }] },
              quantity: '$items.quantity',
              orderAmount: '$totalAmount',
              paymentMethod: { $ifNull: ['$payment.provider', '-'] },
              transactionDate: '$createdAt',
              orderStatus: '$status',
              remarks: { $ifNull: ['$payment.failureReason', '-'] },
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);
  const total = result?.total[0]?.count || 0;
  return {
    items: result?.items || [],
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

async function findRecord(config, id, select) {
  const query = mongoose.isValidObjectId(id) ? config.model.findById(id).populate(config.populate || []) : null;
  const doc = query && (await (select ? query.select(select) : query));
  if (!doc) throw new AppError(404, strings.admin.notFound);
  return doc;
}

async function findLiveRecord(config, id) {
  const doc = await findRecord(config, id);
  if (doc.deletedAt) throw new AppError(409, strings.admin.isDeleted);
  return doc;
}

function getRecord(entity, id) {
  return findRecord(entityConfig(entity), id);
}

function target(config, doc) {
  return { type: config.type, id: doc._id, label: config.label(doc) };
}

function refuseSelf(admin, user) {
  if (admin._id.equals(user._id)) throw new AppError(409, strings.admin.notOnSelf);
}

// ----- Delete guards -----

// BR-5: a book with active listings or open orders may not be deleted.
async function assertBookDeletable(book) {
  const [activeListing, openOrder] = await Promise.all([
    Listing.exists({ book: book._id, status: LISTING_STATUS.ACTIVE, deletedAt: null }),
    Order.exists({ 'items.book': book._id, status: trusted({ $in: OPEN_ORDER_STATUSES }), deletedAt: null }),
  ]);
  if (activeListing || openOrder) throw new AppError(409, strings.admin.bookInUse);
}

async function assertCategoryDeletable(category) {
  if (await Book.exists({ category: category._id, deletedAt: null })) throw new AppError(409, strings.admin.categoryInUse);
}

function assertOrderDeletable(order) {
  if (OPEN_ORDER_STATUSES.includes(order.status)) throw new AppError(409, strings.admin.orderOpen);
}

// ----- Soft delete and restore (SRS 6.2) -----

async function deleteRecord(admin, entity, id) {
  const config = entityConfig(entity);
  const doc = await findLiveRecord(config, id);

  if (entity === 'users') {
    refuseSelf(admin, doc);
    doc.statusBeforeDelete = doc.status;
    doc.status = ACCOUNT_STATUS.DELETED;
  }
  if (entity === 'books') await assertBookDeletable(doc);
  if (entity === 'categories') await assertCategoryDeletable(doc);
  if (entity === 'orders') assertOrderDeletable(doc);

  doc.deletedAt = new Date();
  await doc.save();
  if (entity === 'reviews') await recomputeBookRating(doc.book);
  await audit.record(admin, 'delete', target(config, doc));
  return doc;
}

async function restoreRecord(admin, entity, id) {
  const config = entityConfig(entity);
  const doc = await findRecord(config, id, entity === 'users' ? '+statusBeforeDelete' : undefined);
  if (!doc.deletedAt) throw new AppError(409, strings.admin.notDeleted);
  if (!isWithinRetention(doc.deletedAt)) throw new AppError(410, strings.admin.retentionExpired);

  if (entity === 'users') {
    doc.status = doc.statusBeforeDelete || ACCOUNT_STATUS.ACTIVE;
    doc.statusBeforeDelete = undefined;
  }
  doc.deletedAt = null;
  await doc.save();
  if (entity === 'reviews') await recomputeBookRating(doc.book);
  await audit.record(admin, 'restore', target(config, doc));
  return doc;
}

// ----- Users and sellers -----

async function setUserStatus(admin, id, status, action) {
  const config = ENTITIES.users;
  const user = await findLiveRecord(config, id);
  refuseSelf(admin, user);
  if (user.status === status) throw new AppError(409, strings.admin.alreadyInState(status));
  user.status = status;
  await user.save();
  await audit.record(admin, action, target(config, user));
  return user;
}

const suspendUser = (admin, id) => setUserStatus(admin, id, ACCOUNT_STATUS.SUSPENDED, 'suspend');
const reinstateUser = (admin, id) => setUserStatus(admin, id, ACCOUNT_STATUS.ACTIVE, 'reinstate');

async function promoteToAdministrator(admin, id) {
  const config = ENTITIES.users;
  const user = await findLiveRecord(config, id);
  if (user.role === ROLES.ADMINISTRATOR) throw new AppError(409, strings.admin.alreadyAdministrator);
  const previousRole = user.role;
  user.role = ROLES.ADMINISTRATOR;
  await user.save();
  await audit.record(admin, 'promote', target(config, user), { from: previousRole, to: ROLES.ADMINISTRATOR });
  return user;
}

// ----- Seller requests -----

// Pending requests, oldest first.
async function listSellerRequests(query = {}) {
  const page = pageNumber(query.page);
  const filter = { 'sellerRequest.status': SELLER_REQUEST_STATUS.PENDING, deletedAt: null };
  const [items, total] = await Promise.all([
    User.find(filter).sort({ 'sellerRequest.requestedAt': 1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE),
    User.countDocuments(filter),
  ]);
  return { items, page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

async function pendingRequestUser(id) {
  const user = await findLiveRecord(ENTITIES.users, id);
  if (user.sellerRequest?.status !== SELLER_REQUEST_STATUS.PENDING) throw new AppError(409, strings.admin.noPendingRequest);
  return user;
}

async function approveSellerRequest(admin, id) {
  const user = await pendingRequestUser(id);
  user.role = ROLES.SELLER;
  user.rejectReasonCode = undefined;
  user.sellerRequest.status = SELLER_REQUEST_STATUS.APPROVED;
  user.sellerRequest.decidedAt = new Date();
  user.sellerRequest.decidedBy = admin._id;
  await user.save();
  await audit.record(admin, 'approve-seller', target(ENTITIES.users, user));
  return user;
}

// Rejection records the Appendix B Reject Reason Code.
async function rejectSellerRequest(admin, id, body = {}) {
  const v = new FieldValidator();
  const reasonCode = v.oneOf('reasonCode', body.reasonCode, REJECT_REASON_CODES, { label: strings.labels.reasonCode });
  v.throwIfInvalid();
  const user = await pendingRequestUser(id);
  user.rejectReasonCode = reasonCode;
  user.sellerRequest.status = SELLER_REQUEST_STATUS.REJECTED;
  user.sellerRequest.decidedAt = new Date();
  user.sellerRequest.decidedBy = admin._id;
  await user.save();
  await audit.record(admin, 'reject-seller', target(ENTITIES.users, user), { reasonCode });
  return user;
}

// ----- Books and listings -----

function isLiveCategory(id) {
  return typeof id === 'string' && mongoose.isValidObjectId(id) && Category.exists({ _id: id, deletedAt: null });
}

// Validates a catalog book. Every field is checked before the first error is reported.
// With `partial` (an edit) only the fields present in the body are checked and returned, and
// the ISBN is never read: it identifies the book and cannot be changed.
async function bookFields(body, { partial = false } = {}) {
  const v = new FieldValidator();
  const labels = strings.labels;
  const given = (field) => !partial || body[field] !== undefined;
  const fields = {};
  if (!partial) fields.isbn = v.isbn('isbn', body.isbn);
  if (given('title')) fields.title = v.text('title', body.title, { label: labels.title, required: true, max: LIMITS.bookTitle });
  if (given('author')) fields.author = v.text('author', body.author, { label: labels.author, required: true, max: LIMITS.bookAuthor });
  if (given('category')) {
    fields.category = body.category;
    if ([undefined, null, ''].includes(body.category)) v.addError('category', strings.fields.required(labels.category));
    else if (!(await isLiveCategory(body.category))) v.addError('category', strings.admin.unknownCategory);
  }
  if (given('price')) fields.price = v.price('price', body.price);
  if (given('description')) {
    fields.description = v.text('description', body.description, { label: labels.description, max: LIMITS.bookDescription });
  }
  if (given('coverImageUrl')) {
    fields.coverImageUrl = v.url('coverImageUrl', body.coverImageUrl, { label: labels.coverImageUrl, max: LIMITS.coverImageUrl });
  }
  v.throwIfInvalid();
  // A cleared optional field is stored as absent.
  for (const field of ['description', 'coverImageUrl']) if (fields[field] === '') fields[field] = undefined;
  return fields;
}

function isbnTaken(existing) {
  const message = existing.deletedAt ? strings.admin.isbnExistsDeleted : strings.admin.isbnExists;
  return new AppError(409, message, { isbn: message });
}

// REQ-4, BR-4: listings can only reference catalog books, so this is how new titles enter the store.
// ISBNs are unique across live and deleted books, since a deleted book can still be restored.
async function createBook(admin, body = {}) {
  const fields = await bookFields(body);
  const existing = await Book.findOne({ isbn: fields.isbn }).select('deletedAt');
  if (existing) throw isbnTaken(existing);
  let book;
  try {
    book = await Book.create(fields);
  } catch (err) {
    if (err && err.code === 11000) throw isbnTaken({ deletedAt: null });
    throw err;
  }
  await audit.record(admin, 'create', target(ENTITIES.books, book), { isbn: book.isbn });
  return book.populate(ENTITIES.books.populate);
}

// REQ-4: edits a book's details. Only fields whose value changes are saved and named in the audit
// entry; an edit that changes nothing writes no entry. Orders keep their own snapshot of the
// title and price (SASD 4.1), so past orders are unaffected.
async function updateBook(admin, id, body = {}) {
  const config = ENTITIES.books;
  const book = await findLiveRecord(config, id);
  const fields = await bookFields(body, { partial: true });
  const current = (field) => (field === 'category' ? String(book.populated('category') || book.category) : book[field]);
  const changed = Object.keys(fields).filter((field) => current(field) !== fields[field]);
  if (changed.length === 0) return book;

  for (const field of changed) book[field] = fields[field];
  await book.save();
  await audit.record(admin, 'edit', target(config, book), { fields: changed });
  return book.populate(config.populate);
}

// BR-5: mark a book unavailable (or available again) instead of deleting it.
async function setBookAvailability(admin, id, body = {}) {
  if (typeof body.available !== 'boolean') throw new AppError(400, strings.common.validationFailed, { available: strings.common.validationFailed });
  const config = ENTITIES.books;
  const book = await findLiveRecord(config, id);
  book.markedUnavailable = !body.available;
  await book.save();
  await audit.record(admin, body.available ? 'mark-available' : 'mark-unavailable', target(config, book));
  return book;
}

async function setListingStatus(admin, id, status, action) {
  const config = ENTITIES.listings;
  const listing = await findLiveRecord(config, id);
  if (listing.status === status) throw new AppError(409, strings.admin.alreadyInState(status));
  listing.status = status;
  await listing.save();
  await audit.record(admin, action, target(config, listing));
  return listing;
}

const suspendListing = (admin, id) => setListingStatus(admin, id, LISTING_STATUS.SUSPENDED, 'suspend');
const reinstateListing = (admin, id) => setListingStatus(admin, id, LISTING_STATUS.ACTIVE, 'reinstate');

// REQ-19 / TBD-1: open orders remain valid from their stored order-item snapshots. An
// administrator may therefore approve hiding the listing without changing or cancelling orders.
async function listListingRemovalRequests({ page: pageValue = 1, status } = {}) {
  const page = pageNumber(pageValue);
  const allowedStatuses = Object.values(LISTING_REMOVAL_STATUS);
  const requestStatus = status || LISTING_REMOVAL_STATUS.PENDING;
  if (!allowedStatuses.includes(requestStatus)) {
    throw new AppError(400, 'Choose a valid listing removal request status.');
  }

  const filter = { status: requestStatus };
  const populate = [
    {
      path: 'listing',
      select: 'book seller status deletedAt',
      populate: [{ path: 'book', select: 'title isbn' }, { path: 'seller', select: 'name' }],
    },
    { path: 'seller', select: 'name' },
    { path: 'openOrders', select: 'status createdAt totalAmount' },
    { path: 'reviewedBy', select: 'name' },
  ];
  const [items, total] = await Promise.all([
    ListingRemovalRequest.find(filter)
      .populate(populate)
      .sort({ createdAt: 1, _id: 1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE),
    ListingRemovalRequest.countDocuments(filter),
  ]);
  return { items, page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

async function resolveListingRemovalRequest(admin, id, body = {}) {
  if (!mongoose.isValidObjectId(id)) throw new AppError(404, strings.admin.notFound);

  const status = body.status;
  if (![LISTING_REMOVAL_STATUS.APPROVED, LISTING_REMOVAL_STATUS.REJECTED].includes(status)) {
    throw new AppError(400, 'Choose Approve or Reject for the removal request.', {
      status: 'Choose Approve or Reject.',
    });
  }

  if (typeof body.resolutionNote !== 'string' || !body.resolutionNote.trim()) {
    throw new AppError(400, 'Add a note explaining the decision.', {
      resolutionNote: 'A resolution note is required.',
    });
  }
  const resolutionNote = sanitizeText(body.resolutionNote);
  if (characterCount(resolutionNote) > 1000) {
    throw new AppError(400, 'The resolution note must be at most 1,000 characters.', {
      resolutionNote: 'The resolution note must be at most 1,000 characters.',
    });
  }

  const session = await mongoose.startSession();
  let resolved;
  try {
    await session.withTransaction(async () => {
      const removalRequest = await ListingRemovalRequest.findOne({
        _id: id,
        status: LISTING_REMOVAL_STATUS.PENDING,
      }).session(session);

      if (!removalRequest) {
        const existing = await ListingRemovalRequest.findById(id).session(session);
        throw new AppError(existing ? 409 : 404, existing
          ? 'This listing removal request has already been resolved.'
          : strings.admin.notFound);
      }

      const listing = await Listing.findById(removalRequest.listing).session(session);
      if (!listing) throw new AppError(409, 'The listing for this request no longer exists.');

      if (status === LISTING_REMOVAL_STATUS.APPROVED && !listing.deletedAt) {
        listing.deletedAt = new Date();
        await listing.save({ session });
      }

      removalRequest.status = status;
      removalRequest.resolutionNote = resolutionNote;
      removalRequest.reviewedBy = admin._id;
      removalRequest.reviewedAt = new Date();
      await removalRequest.save({ session });
      resolved = removalRequest;
    });
  } finally {
    await session.endSession();
  }

  const action = status === LISTING_REMOVAL_STATUS.APPROVED
    ? 'approve-listing-removal'
    : 'reject-listing-removal';
  await audit.record(
    admin,
    action,
    { type: 'ListingRemovalRequest', id: resolved._id, label: `Listing removal request ${resolved.id}` },
    { listingId: String(resolved.listing), resolutionNote },
  );
  return resolved.populate([
    { path: 'listing', select: 'book', populate: { path: 'book', select: 'title isbn' } },
    { path: 'seller', select: 'name' },
    { path: 'openOrders', select: 'status createdAt totalAmount' },
    { path: 'reviewedBy', select: 'name' },
  ]);
}

// ----- Categories (BR-3: only administrators alter the category structure) -----

function categoryName(body) {
  const v = new FieldValidator();
  const name = v.text('name', body.name, { label: strings.labels.categoryName, required: true, max: LIMITS.categoryName });
  v.throwIfInvalid();
  return name;
}

function categoryExists(err) {
  return err && err.code === 11000;
}

async function createCategory(admin, body = {}) {
  const name = categoryName(body);
  try {
    const category = await Category.create({ name });
    await audit.record(admin, 'create', target(ENTITIES.categories, category));
    return category;
  } catch (err) {
    if (categoryExists(err)) throw new AppError(409, strings.admin.categoryExists, { name: strings.admin.categoryExists });
    throw err;
  }
}

async function renameCategory(admin, id, body = {}) {
  const name = categoryName(body);
  const config = ENTITIES.categories;
  const category = await findLiveRecord(config, id);
  const previous = category.name;
  category.name = name;
  try {
    await category.save();
  } catch (err) {
    if (categoryExists(err)) throw new AppError(409, strings.admin.categoryExists, { name: strings.admin.categoryExists });
    throw err;
  }
  await audit.record(admin, 'rename', target(config, category), { from: previous, to: name });
  return category;
}

async function changeOrderStatus(admin, id, body = {}) {
  if (!Object.values(ORDER_STATUS).includes(body.status)) {
    const message = 'Choose a valid order status.';
    throw new AppError(400, message, { status: message });
  }

  if (mongoose.isValidObjectId(id)) {
    const storedOrder = await Order.findById(id).select('deletedAt');
    if (storedOrder?.deletedAt) throw new AppError(409, strings.admin.isDeleted);
  }

  const { order, previousStatus } = await orderService.adminSetOrderStatus(admin._id, id, body.status);
  const action = body.status === ORDER_STATUS.CANCELLED ? 'cancel-order' : 'change-order-status';
  await audit.record(admin, action, target(ENTITIES.orders, order), {
    from: previousStatus,
    to: body.status,
  });
  return order.populate(ENTITIES.orders.populate);
}

module.exports = {
  ENTITIES,
  PAGE_SIZE,
  listRecords,
  listOrderTransactionReport,
  getRecord,
  deleteRecord,
  restoreRecord,
  suspendUser,
  reinstateUser,
  promoteToAdministrator,
  listSellerRequests,
  approveSellerRequest,
  rejectSellerRequest,
  createBook,
  updateBook,
  setBookAvailability,
  suspendListing,
  reinstateListing,
  listListingRemovalRequests,
  resolveListingRemovalRequest,
  createCategory,
  renameCategory,
  changeOrderStatus,
};
