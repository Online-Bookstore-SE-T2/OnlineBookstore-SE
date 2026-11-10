const mongoose = require('mongoose');
const { Book, Listing, Order, ListingRemovalRequest } = require('../models');
const {
  OPEN_ORDER_STATUSES,
  LISTING_CONDITIONS,
  LISTING_STATUS,
  LISTING_REMOVAL_STATUS,
} = require('../constants');
const {
  isMoney,
  isValidIsbn13,
  sanitizeText,
  characterCount,
} = require('../validation/validators');
const { AppError } = require('../utils/errors');
const strings = require('../resources/strings');

function validate(body, partial = false) {
  const values = {};

  for (const field of ['price', 'quantity', 'condition', 'notes']) {
    if (partial && body[field] === undefined) {
      continue;
    }

    if (field === 'price') {
      if (!isMoney(body.price) || body.price <= 0) {
        throw new AppError(
          400,
          strings.listing.positivePrice,
          { price: strings.listing.validPrice }
        );
      }

      values.price = body.price;
    } else if (field === 'quantity') {
      if (
        !Number.isInteger(body.quantity) ||
        body.quantity < (partial ? 0 : 1)
      ) {
        throw new AppError(
          400,
          strings.listing.validQuantity,
          { quantity: strings.listing.enterValidQuantity }
        );
      }

      values.quantity = body.quantity;
    } else if (field === 'condition') {
      if (!LISTING_CONDITIONS.includes(body.condition)) {
        throw new AppError(
          400,
          strings.listing.validCondition,
          { condition: strings.listing.chooseValidCondition }
        );
      }

      values.condition = body.condition;
    } else if (field === 'notes') {
      // Notes are optional. Missing, null, or empty notes become an empty string.
      if (
        body.notes === undefined ||
        body.notes === null ||
        body.notes === ''
      ) {
        values.notes = '';
      } else {
        if (typeof body.notes !== 'string') {
          throw new AppError(
            400,
            strings.listing.notesMustBeText,
            { notes: strings.listing.enterNotesText }
          );
        }

        values.notes = sanitizeText(body.notes);

        if (characterCount(values.notes) > 500) {
          throw new AppError(
            400,
            strings.listing.notesTooLong,
            { notes: strings.listing.notesTooLong }
          );
        }
      }
    }
  }

  return values;
}

async function createListing(sellerId, body = {}) {
  if (!isValidIsbn13(body.isbn)) {
    throw new AppError(
      400,
      strings.listing.invalidIsbn,
      { isbn: strings.listing.invalidIsbn }
    );
  }

  const book = await Book.findOne({
    isbn: body.isbn,
    deletedAt: null,
    markedUnavailable: false,
  });

  if (!book) {
    throw new AppError(
      404,
      strings.listing.isbnUnavailable
    );
  }

  return Listing.create({
    ...validate(body),
    book: book._id,
    seller: sellerId,
  });
}

async function myListings(sellerId, page = 1) {
  const safePage =
    Number.isInteger(Number(page)) && Number(page) > 0
      ? Number(page)
      : 1;

  const filter = {
    seller: sellerId,
    deletedAt: null,
  };

  const [listings, total] = await Promise.all([
    Listing.find(filter)
      .populate('book', 'title author isbn averageRating reviewCount')
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * 20)
      .limit(20),

    Listing.countDocuments(filter),
  ]);

  return {
    listings,
    page: safePage,
    pageSize: 20,
    total,
    totalPages: Math.max(1, Math.ceil(total / 20)),
  };
}

async function publicListings(bookId) {
  if (!mongoose.isValidObjectId(bookId)) {
    throw new AppError(404, strings.listing.bookNotFound);
  }

  const book = await Book.findOne({
    _id: bookId,
    deletedAt: null,
    markedUnavailable: false,
  });

  if (!book) {
    throw new AppError(404, strings.listing.bookNotFound);
  }

  const listings = await Listing.find({
    book: book._id,
    status: LISTING_STATUS.ACTIVE,
    quantity: mongoose.trusted({ $gt: 0 }),
    deletedAt: null,
  })
    .populate('seller', 'name')
    .sort({ price: 1, createdAt: 1 });

  return { listings };
}

async function ownedListing(sellerId, id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(404, strings.listing.notFound);
  }

  const listing = await Listing.findOne({
    _id: id,
    seller: sellerId,
    deletedAt: null,
  });

  if (!listing) {
    throw new AppError(404, strings.listing.notFound);
  }

  return listing;
}

async function updateListing(sellerId, id, body = {}) {
  const listing = await ownedListing(sellerId, id);

  Object.assign(listing, validate(body, true));

  await listing.save();

  return listing;
}

async function removeListing(sellerId, id) {
  const listing = await ownedListing(sellerId, id);

  const openOrder = await Order.exists({
    'items.listing': listing._id,
    status: mongoose.trusted({ $in: OPEN_ORDER_STATUSES }),
    deletedAt: null,
  });

  if (openOrder) {
    throw new AppError(
      409,
      strings.listing.tiedToOpenOrder
    );
  }

  listing.deletedAt = new Date();

  await listing.save();

  return listing;
}

async function requestListingRemoval(sellerId, id, body = {}) {
  const listing = await ownedListing(sellerId, id);
  if (typeof body.reason !== 'string' || !body.reason.trim()) {
    throw new AppError(400, strings.listing.removalReasonRequired, {
      reason: strings.listing.reasonRequired,
    });
  }

  const reason = sanitizeText(body.reason);
  if (characterCount(reason) > 1000) {
    throw new AppError(400, strings.listing.reasonTooLong, {
      reason: strings.listing.reasonTooLong,
    });
  }

  const openOrders = await Order.find({
    'items.listing': listing._id,
    status: mongoose.trusted({ $in: OPEN_ORDER_STATUSES }),
    deletedAt: null,
  }).select('_id');

  if (openOrders.length === 0) {
    throw new AppError(409, strings.listing.canRemoveDirectly);
  }

  const existing = await ListingRemovalRequest.findOne({
    listing: listing._id,
    status: LISTING_REMOVAL_STATUS.PENDING,
  });
  if (existing) return { request: existing, created: false };

  try {
    const [request] = await ListingRemovalRequest.create([{
      listing: listing._id,
      seller: sellerId,
      reason,
      openOrders: openOrders.map((order) => order._id),
    }]);
    return { request, created: true };
  } catch (error) {
    // A concurrent request may win the unique pending-request index.
    if (error.code !== 11000) throw error;
    const request = await ListingRemovalRequest.findOne({
      listing: listing._id,
      status: LISTING_REMOVAL_STATUS.PENDING,
    });
    if (!request) throw error;
    return { request, created: false };
  }
}

async function myListingRemovalRequests(sellerId, page = 1) {
  const safePage = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const filter = { seller: sellerId };
  const [requests, total] = await Promise.all([
    ListingRemovalRequest.find(filter)
      .populate({ path: 'listing', select: 'book', populate: { path: 'book', select: 'title isbn' } })
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * 20)
      .limit(20),
    ListingRemovalRequest.countDocuments(filter),
  ]);
  return {
    requests,
    page: safePage,
    pageSize: 20,
    total,
    totalPages: Math.max(1, Math.ceil(total / 20)),
  };
}

module.exports = {
  createListing,
  myListings,
  publicListings,
  updateListing,
  removeListing,
  requestListingRemoval,
  myListingRemovalRequests,
};
