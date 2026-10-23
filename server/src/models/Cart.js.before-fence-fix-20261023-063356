
const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins/toJSON');
const { softDeletePlugin } = require('./plugins/softDelete');

const cartItemSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Listing',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isInteger,
    },
  },
  { _id: false },
);

const cartSchema = new mongoose.Schema(
  {
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
  },
  { timestamps: true },
);

cartSchema.plugin(softDeletePlugin);
cartSchema.plugin(toJSONPlugin);

module.exports =
  mongoose.models.Cart || mongoose.model('Cart', cartSchema);
```