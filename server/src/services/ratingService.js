const mongoose = require('mongoose');
const { Review, Book } = require('../models');

// Always derive the cached rating from live reviews so edits, moderation and restores agree.
async function recomputeBookRating(bookId) {
  const id = bookId?._id || bookId;
  const [aggregate] = await Review.aggregate([
    { $match: { book: new mongoose.Types.ObjectId(id), deletedAt: null } },
    { $group: { _id: '$book', average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const averageRating = aggregate ? Math.round(aggregate.average * 10) / 10 : 0;
  const reviewCount = aggregate?.count || 0;
  await Book.updateOne({ _id: id, deletedAt: null }, { $set: { averageRating, reviewCount } });
  return { averageRating, reviewCount };
}

module.exports = { recomputeBookRating };
