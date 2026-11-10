const mongoose = require('mongoose');
const { Book, Review, Order, Listing } = require('../models');
const { ORDER_STATUS, LISTING_STATUS } = require('../constants');
const { AppError } = require('../utils/errors');
const strings = require('../resources/strings');
const { sanitizeText, characterCount } = require('../validation/validators');
const { recomputeBookRating } = require('./ratingService');

const EDIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

async function liveBook(bookId) {
  if (!mongoose.isValidObjectId(bookId)) throw new AppError(404, strings.review.bookNotFound);
  const book = await Book.findOne({ _id: bookId, deletedAt: null });
  if (!book) throw new AppError(404, strings.review.bookNotFound);
  return book;
}

async function listReviews(bookId, page = 1) {
  const book = await liveBook(bookId);
  const safePage = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const filter = { book: book._id, deletedAt: null };
  const [reviews, total] = await Promise.all([
    Review.find(filter).populate('user', 'name').sort({ createdAt: -1, _id: -1 }).skip((safePage - 1) * 20).limit(20),
    Review.countDocuments(filter),
  ]);
  return { book: { id: book.id, title: book.title, author: book.author, averageRating: book.averageRating, reviewCount: book.reviewCount }, reviews, page: safePage, pageSize: 20, total, totalPages: Math.max(1, Math.ceil(total / 20)) };
}

async function myReview(userId, bookId) {
  await liveBook(bookId);
  return Review.findOne({ user: userId, book: bookId, deletedAt: null });
}

async function deliveredOrder(userId, bookId) {
  const order = await Order.findOne({ buyer: userId, status: ORDER_STATUS.DELIVERED, deletedAt: null, 'items.book': bookId });
  if (!order) throw new AppError(403, strings.review.deliveredOrderRequired);
  return order;
}

async function validateReview(userId, book, rating, text) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new AppError(400, strings.review.invalidRating, { rating: strings.review.enterRating });
  let cleanText;
  if (text !== undefined && text !== null) {
    if (typeof text !== 'string') throw new AppError(400, strings.review.textMustBeText, { text: strings.review.enterText });
    cleanText = sanitizeText(text);
    if (characterCount(cleanText) > 2000) throw new AppError(400, strings.review.textTooLong, { text: strings.review.textTooLong });
  }
  const user = await require('../models/User').findById(userId);
  if (user.role === 'Seller' && await Listing.exists({ seller: userId, book: book._id, status: LISTING_STATUS.ACTIVE, quantity: mongoose.trusted({ $gt: 0 }), deletedAt: null })) {
    throw new AppError(403, strings.review.sellersCannotReview);
  }
  return cleanText;
}

async function createReview(userId, bookId, body = {}) {
  const book = await liveBook(bookId);
  const text = await validateReview(userId, book, body.rating, body.text);
  const order = await deliveredOrder(userId, book._id);
  try {
    const review = await Review.create({ user: userId, book: book._id, order: order._id, rating: body.rating, text });
    await recomputeBookRating(book._id);
    return review;
  } catch (err) {
    if (err.code === 11000) throw new AppError(409, strings.review.alreadyReviewed);
    throw err;
  }
}

async function updateMyReview(userId, bookId, body = {}) {
  const book = await liveBook(bookId);
  const review = await Review.findOne({ user: userId, book: book._id, deletedAt: null });
  if (!review) throw new AppError(404, strings.review.notFound);
  if (Date.now() - review.createdAt.getTime() > EDIT_WINDOW_MS) throw new AppError(409, strings.review.editExpired);
  const text = await validateReview(userId, book, body.rating, body.text);
  review.rating = body.rating;
  review.text = text;
  await review.save();
  const aggregate = await recomputeBookRating(book._id);
  return { review, ...aggregate };
}

module.exports = { listReviews, myReview, createReview, updateMyReview };
