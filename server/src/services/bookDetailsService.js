
const mongoose = require('mongoose');
const { Book, Review } = require('../models');
const { AppError } = require('../utils/errors');
const strings = require('../resources/strings');

async function getBookDetails(bookId) {
  if (!mongoose.isValidObjectId(bookId)) {
    throw new AppError(404, strings.common.notFound);
  }

  const book = await Book.findOne({
    _id: bookId,
    deletedAt: null,
  })
    .populate('category', 'name')
    .lean();

  if (!book) {
    throw new AppError(404, strings.common.notFound);
  }

  const reviews = await Review.find({
    book: book._id,
    deletedAt: null,
  })
    .populate('user', 'name')
    .sort({ createdAt: -1, _id: -1 })
    .lean();

  return {
    book,
    rating: {
      average: book.averageRating ?? 0,
      count: book.reviewCount ?? reviews.length,
    },
    reviews: reviews.map((review) => ({
      id: review._id,
      rating: review.rating,
      text: review.text || '',
      reviewer: review.user?.name || 'Bookstore customer',
      createdAt: review.createdAt,
    })),
  };
}

module.exports = { getBookDetails };
