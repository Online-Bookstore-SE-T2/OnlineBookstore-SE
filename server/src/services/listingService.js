const mongoose = require('mongoose');
const { Book, Listing, Order } = require('../models');
const { OPEN_ORDER_STATUSES, LISTING_CONDITIONS, LISTING_STATUS } = require('../constants');
const { isMoney, isValidIsbn13, sanitizeText, characterCount } = require('../validation/validators');
const { AppError } = require('../utils/errors');

function validate(body, partial = false) {
  const values = {};
  for (const field of ['price', 'quantity', 'condition', 'notes']) {
    if (partial && body[field] === undefined) continue;
    if (field === 'price') {
      if (!isMoney(body.price) || body.price <= 0) throw new AppError(400, 'Price must be a positive INR amount with at most two decimals.', { price: 'Enter a valid price.' });
      values.price = body.price;
    } else if (field === 'quantity') {
      if (!Number.isInteger(body.quantity) || body.quantity < (partial ? 0 : 1)) throw new AppError(400, 'Quantity must be a whole number greater than zero when creating a listing.', { quantity: 'Enter a valid quantity.' });
      values.quantity = body.quantity;
    } else if (field === 'condition') {
      if (!LISTING_CONDITIONS.includes(body.condition)) throw new AppError(400, 'Choose a valid book condition.', { condition: 'Choose a valid condition.' });
      values.condition = body.condition;
    } else if (body.notes !== null && body.notes !== '') {
      if (typeof body.notes !== 'string') throw new AppError(400, 'Notes must be text.', { notes: 'Enter text.' });
      values.notes = sanitizeText(body.notes);
      if (characterCount(values.notes) > 500) throw new AppError(400, 'Notes must be at most 500 characters.', { notes: 'Notes must be at most 500 characters.' });
    } else values.notes = '';
  }
  return values;
}

async function createListing(sellerId, body = {}) {
  if (!isValidIsbn13(body.isbn)) throw new AppError(400, 'Enter a valid ISBN-13.', { isbn: 'Enter a valid ISBN-13.' });
  const book = await Book.findOne({ isbn: body.isbn, deletedAt: null, markedUnavailable: false });
  if (!book) throw new AppError(404, 'That ISBN is not an available book in the catalog.');
  return Listing.create({ ...validate(body), book: book._id, seller: sellerId });
}

async function myListings(sellerId, page = 1) {
  const safePage = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const filter = { seller: sellerId, deletedAt: null };
  const [listings, total] = await Promise.all([
    Listing.find(filter).populate('book', 'title author isbn averageRating reviewCount').sort({ createdAt: -1 }).skip((safePage - 1) * 20).limit(20),
    Listing.countDocuments(filter),
  ]);
  return { listings, page: safePage, pageSize: 20, total, totalPages: Math.max(1, Math.ceil(total / 20)) };
}

async function publicListings(bookId) {
  if (!mongoose.isValidObjectId(bookId)) throw new AppError(404, 'Book not found.');
  const book = await Book.findOne({ _id: bookId, deletedAt: null, markedUnavailable: false });
  if (!book) throw new AppError(404, 'Book not found.');
  const listings = await Listing.find({ book: book._id, status: LISTING_STATUS.ACTIVE, quantity: { $gt: 0 }, deletedAt: null }).populate('seller', 'name').sort({ price: 1, createdAt: 1 });
  return { listings };
}

async function ownedListing(sellerId, id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError(404, 'Listing not found.');
  const listing = await Listing.findOne({ _id: id, seller: sellerId, deletedAt: null });
  if (!listing) throw new AppError(404, 'Listing not found.');
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
  const openOrder = await Order.exists({ 'items.listing': listing._id, status: { $in: OPEN_ORDER_STATUSES }, deletedAt: null });
  if (openOrder) throw new AppError(409, 'This listing is tied to an open order. Contact an administrator for help before removing it.');
  listing.deletedAt = new Date();
  await listing.save();
  return listing;
}

module.exports = { createListing, myListings, publicListings, updateListing, removeListing };
