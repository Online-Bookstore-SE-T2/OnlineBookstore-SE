const mongoose = require('mongoose');
const { isValidIsbn13, isMoney } = require('../validation/validators');
const { toJSONPlugin } = require('./plugins/toJSON');
const { softDeletePlugin } = require('./plugins/softDelete');

// Minimal shared model holding the fields the SRS names for a catalog book (REQ-5, REQ-8,
// REQ-17, SRS 6.5). The catalog slice owns and extends it.
const bookSchema = new mongoose.Schema(
  {
    isbn: {
      type: String,
      required: true,
      unique: true,
      validate: { validator: isValidIsbn13, message: 'ISBN must be a valid ISBN-13.' },
    },
    title: { type: String, required: true, trim: true },
    author: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    price: { type: Number, validate: { validator: isMoney, message: 'Price must be INR with at most two decimals.' } },
    coverImageUrl: { type: String, trim: true },
    // BR-5: a book with active listings or open orders cannot be deleted, only marked unavailable.
    markedUnavailable: { type: Boolean, default: false },
    averageRating: { type: Number, min: 0, max: 5, default: 0 },
    reviewCount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true },
);

// SRS 6.1 / 7: index title, author, ISBN (unique above) and category.
bookSchema.index({ title: 1 });
bookSchema.index({ author: 1 });
bookSchema.index({ category: 1 });

bookSchema.plugin(softDeletePlugin);
bookSchema.plugin(toJSONPlugin);

module.exports = mongoose.models.Book || mongoose.model('Book', bookSchema);
