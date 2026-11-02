const mongoose = require('mongoose');
const { LISTING_REMOVAL_STATUS } = require('../constants');
const { toJSONPlugin } = require('./plugins/toJSON');

const listingRemovalRequestSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    // Snapshot the open orders that caused the seller's self-removal to be blocked.
    openOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
    status: {
      type: String,
      enum: Object.values(LISTING_REMOVAL_STATUS),
      default: LISTING_REMOVAL_STATUS.PENDING,
      required: true,
    },
    resolutionNote: { type: String, trim: true, maxlength: 1000 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
  },
  { timestamps: true },
);

listingRemovalRequestSchema.index(
  { listing: 1 },
  {
    unique: true,
    partialFilterExpression: { status: LISTING_REMOVAL_STATUS.PENDING },
  },
);
listingRemovalRequestSchema.index({ status: 1, createdAt: 1 });
listingRemovalRequestSchema.index({ seller: 1, createdAt: -1 });
listingRemovalRequestSchema.plugin(toJSONPlugin);

module.exports = mongoose.models.ListingRemovalRequest
  || mongoose.model('ListingRemovalRequest', listingRemovalRequestSchema);
