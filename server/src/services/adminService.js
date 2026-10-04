const mongoose = require('mongoose');
const { User, Category, Book, Listing, Review, Order } = require('../models');
const {
  ROLES,
  ACCOUNT_STATUS,
  SELLER_REQUEST_STATUS,
  REJECT_REASON_CODES,
  OPEN_ORDER_STATUSES,
  LISTING_STATUS,
} = require('../constants');
const strings = require('../resources/strings');
const { AppError } = require('../utils/errors');
const { FieldValidator, LIMITS } = require('../validation/validators');
const { isWithinRetention } = require('../models/plugins/softDelete');
const audit = require('./auditService');

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

module.exports = {
  ENTITIES,
  PAGE_SIZE,
  listRecords,
  getRecord,
  deleteRecord,
  restoreRecord,
  suspendUser,
  reinstateUser,
  promoteToAdministrator,
  listSellerRequests,
  approveSellerRequest,
  rejectSellerRequest,
  setBookAvailability,
  suspendListing,
  reinstateListing,
  createCategory,
  renameCategory,
};
