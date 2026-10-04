const mongoose = require('mongoose');
const { LISTING_CONDITIONS, LISTING_STATUS } = require('../constants');
const { isMoney } = require('../validation/validators');
const { toJSONPlugin } = require('./plugins/toJSON');
const { softDeletePlugin } = require('./plugins/softDelete');

// Minimal shared model of a seller's offer (REQ-18, BR-4). The marketplace slice owns and
// extends it; administrators can suspend, delete and restore listings (REQ-4).
const listingSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    price: {
      type: Number,
      required: true,
      validate: { validator: isMoney, message: 'Price must be INR with at most two decimals.' },
    },
    quantity: { type: Number, required: true, min: 0, validate: Number.isInteger },
    condition: { type: String, enum: LISTING_CONDITIONS, required: true },
    notes: { type: String, trim: true },
    status: { type: String, enum: Object.values(LISTING_STATUS), default: LISTING_STATUS.ACTIVE },
  },
  { timestamps: true },
);

listingSchema.index({ book: 1, status: 1 });
listingSchema.index({ seller: 1 });

listingSchema.plugin(softDeletePlugin);
listingSchema.plugin(toJSONPlugin);

module.exports = mongoose.models.Listing || mongoose.model('Listing', listingSchema);
