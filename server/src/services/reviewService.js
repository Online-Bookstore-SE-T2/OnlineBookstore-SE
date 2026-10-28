const mongoose = require('mongoose');
const { Book, Review, Order, Listing } = require('../models');
const { ORDER_STATUS, LISTING_STATUS } = require('../constants');
const { AppError } = require('../utils/errors');
const { sanitizeText, characterCount } = require('../validation/validators');
const { recomputeBookRating } = require('./ratingService');

const EDIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

async function liveBook(bookId) {
  if (!mongoose.isValidObjectId(bookId)) throw new AppError(404, 'Book not found.');
  const book = await Book.findOne({ _id: bookId, deletedAt: null });
  if (!book) throw new AppError(404, 'Book not found.');
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
  if (!order) throw new AppError(403, 'A delivered order for this book is required before reviewing it.');
  return order;
}

async function validateReview(userId, book, rating, text) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new AppError(400, 'Rating must be a whole number from 1 to 5.', { rating: 'Enter a rating from 1 to 5.' });
  let cleanText;
  if (text !== undefined && text !== null) {
    if (typeof text !== 'string') throw new AppError(400, 'Review must be text.', { text: 'Enter text.' });
    cleanText = sanitizeText(text);
    if (characterCount(cleanText) > 2000) throw new AppError(400, 'Review must be at most 2,000 characters.', { text: 'Review must be at most 2,000 characters.' });
  }
  const user = await require('../models/User').findById(userId);
  if (user.role === 'Seller' && await Listing.exists({ seller: userId, book: book._id, status: LISTING_STATUS.ACTIVE, quantity: mongoose.trusted({ $gt: 0 }), deletedAt: null })) {
    throw new AppError(403, 'Sellers cannot review a book they are actively listing.');
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
    if (err.code === 11000) throw new AppError(409, 'You have already reviewed this book.');
    throw err;
  }
}

async function updateMyReview(userId, bookId, body = {}) {
  const book = await liveBook(bookId);
  const review = await Review.findOne({ user: userId, book: book._id, deletedAt: null });
  if (!review) throw new AppError(404, 'Your review was not found.');
  if (Date.now() - review.createdAt.getTime() > EDIT_WINDOW_MS) throw new AppError(409, 'Reviews can only be edited within 30 days of posting.');
  const text = await validateReview(userId, book, body.rating, body.text);
  review.rating = body.rating;
  review.text = text;
  await review.save();
  const aggregate = await recomputeBookRating(book._id);
  return { review, ...aggregate };
}

module.exports = { listReviews, myReview, createReview, updateMyReview };
