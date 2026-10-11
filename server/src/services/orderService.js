const mongoose = require('mongoose');
const { Order, Listing } = require('../models');
const { ORDER_STATUS } = require('../constants');
const { AppError } = require('../utils/errors');

async function getBuyerOrders(userId) {
  return Order.find({
    buyer: userId,
    deletedAt: null,
  })
    .populate('items.book', 'title author isbn')
    .populate('items.seller', 'name')
    .sort({ createdAt: -1 });
}

async function getBuyerOrder(userId, orderId) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new AppError(400, 'Invalid order ID.');
  }

  const order = await Order.findOne({
    _id: orderId,
    buyer: userId,
    deletedAt: null,
  })
    .populate('items.book', 'title author isbn')
    .populate('items.seller', 'name');

  if (!order) {
    throw new AppError(404, 'Order not found.');
  }

  return order;
}

async function cancelBuyerOrder(userId, orderId) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new AppError(400, 'Invalid order ID.');
  }

  const session = await mongoose.startSession();
  let cancelledOrder;

  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({
        _id: orderId,
        buyer: userId,
        deletedAt: null,
      }).session(session);

      if (!order) {
        throw new AppError(404, 'Order not found.');
      }

      if (order.status !== ORDER_STATUS.PLACED) {
        throw new AppError(
          409,
          'Only unpaid orders with Placed status can be cancelled.'
        );
      }

      if (
        order.payment &&
        (order.payment.status === 'Paid' ||
          order.payment.transactionRef)
      ) {
        throw new AppError(
          409,
          'This order cannot be cancelled through this endpoint.'
        );
      }

      for (const item of order.items) {
        const listing = await Listing.findById(item.listing)
          .session(session);

        if (!listing) {
          throw new AppError(
            409,
            'A listing for this order no longer exists.'
          );
        }

        listing.quantity += item.quantity;
        await listing.save({ session });
      }

      order.status = ORDER_STATUS.CANCELLED;
      await order.save({ session });

      cancelledOrder = order;
    });

    return cancelledOrder;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  getBuyerOrders,
  getBuyerOrder,
  cancelBuyerOrder,
};