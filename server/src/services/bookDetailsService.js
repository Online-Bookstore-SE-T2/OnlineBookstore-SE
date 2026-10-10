
const mongoose = require('mongoose');
const { Book, Review, Listing } = require('../models');
const { LISTING_STATUS } = require('../constants');
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

  const [reviews, listings] = await Promise.all([
    Review.find({
      book: book._id,
      deletedAt: null,
    })
      .populate('user', 'name')
      .sort({ createdAt: -1, _id: -1 })
      .lean(),

    Listing.find({
      book: book._id,
      deletedAt: null,
      status: LISTING_STATUS.ACTIVE,
      quantity: { $gt: 0 },
    })
      .select('_id price quantity condition seller')
      .populate('seller', 'name')
      .sort({ price: 1, _id: 1 })
      .lean(),
  ]);

  return {
    book,

    rating: {
      average: book.averageRating ?? 0,
      count: book.reviewCount ?? reviews.length,
    },

    reviews: reviews.map((review) => ({
      id: String(review._id),
      rating: review.rating,
      text: review.text || '',
      reviewer: review.user?.name || 'Bookstore customer',
      createdAt: review.createdAt,
    })),

    listings: book.markedUnavailable
      ? []
      : listings.map((listing) => ({
          id: String(listing._id),
          price: listing.price,
          quantity: listing.quantity,
          condition: listing.condition,
          seller: listing.seller?.name || 'Bookstore seller',
        })),
  };
}

module.exports = { getBookDetails };
