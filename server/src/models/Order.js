const mongoose = require('mongoose');
const { ORDER_STATUS } = require('../constants');
const { isMoney } = require('../validation/validators');
const { toJSONPlugin } = require('./plugins/toJSON');
const { softDeletePlugin } = require('./plugins/softDelete');

const money = { type: Number, validate: { validator: isMoney, message: 'Amount must be INR with at most two decimals.' } };

// SRS 4: Order 1 - 1..* OrderItem; OrderItem 0..* - 1 Listing.
const orderItemSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
    unitPrice: { ...money, required: true },
  },
  { _id: false },
);

// Minimal shared model of an order (REQ-10 to REQ-14, SRS 3.2). The orders slice owns and
// extends it; administrators can view, delete and restore orders (REQ-4).
const orderSchema = new mongoose.Schema(
  {
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: {
      type: [orderItemSchema],
      validate: { validator: (items) => items.length > 0, message: 'An order needs at least one item.' },
    },
    deliveryAddress: {
      line: String,
      city: String,
      state: String,
      postalCode: String,
    },
    deliveryCharge: { ...money, default: 0 },
    totalAmount: { ...money, required: true },
    status: { type: String, enum: Object.values(ORDER_STATUS), default: ORDER_STATUS.PLACED },
    // SRS 4: Order 1 - 0..1 Payment; SRS 3.2: transaction reference, status and failure reason.
    payment: {
      transactionRef: String,
      status: String,
      failureReason: String,
    },
  },
  { timestamps: true },
);

orderSchema.index({ buyer: 1 });
orderSchema.index({ 'items.book': 1, status: 1 });

orderSchema.plugin(softDeletePlugin);
orderSchema.plugin(toJSONPlugin);

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
