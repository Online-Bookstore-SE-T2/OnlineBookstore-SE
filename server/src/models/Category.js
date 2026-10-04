const mongoose = require('mongoose');
const { LIMITS } = require('../validation/validators');
const { toJSONPlugin } = require('./plugins/toJSON');
const { softDeletePlugin } = require('./plugins/softDelete');

// Minimal shared model (SRS 4, ER model: Category 1 - 0..* Book). The catalog slice owns and
// extends it; the administration console creates, renames and deletes categories (BR-3).
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: LIMITS.categoryName },
  },
  { timestamps: true },
);

// Names are unique regardless of letter case.
categorySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

categorySchema.plugin(softDeletePlugin);
categorySchema.plugin(toJSONPlugin);

module.exports = mongoose.models.Category || mongoose.model('Category', categorySchema);
