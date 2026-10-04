const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins/toJSON');
const { softDeletePlugin } = require('./plugins/softDelete');

// Minimal shared model of a review (REQ-16, SRS 6.5). The reviews slice owns and extends it;
// administrators can remove and restore reviews (REQ-4, BR-3).
const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
    text: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

// SRS 4: one review per user per book.
reviewSchema.index({ user: 1, book: 1 }, { unique: true });

reviewSchema.plugin(softDeletePlugin);
reviewSchema.plugin(toJSONPlugin);

module.exports = mongoose.models.Review || mongoose.model('Review', reviewSchema);
