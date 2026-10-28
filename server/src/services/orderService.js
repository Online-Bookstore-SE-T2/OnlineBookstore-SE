const mongoose = require('mongoose');
const { Order, Listing } = require('../models');
const { ORDER_STATUS } = require('../constants');
const { AppError } = require('../utils/errors');
const notificationService = require('./notificationService');

const BUYER_CANCELLABLE_STATUSES = Object.freeze([ORDER_STATUS.PLACED, ORDER_STATUS.PAID]);

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
  let previousStatus;

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

      // SRS 6.2: a buyer may cancel only before the order reaches Shipped.
      if (!BUYER_CANCELLABLE_STATUSES.includes(order.status)) {
        throw new AppError(
          409,
          'Only orders that have not yet shipped can be cancelled.'
        );
      }

      previousStatus = order.status;

      // Refunds are outside Release 1.0; record that one is owed.
      if (order.payment && order.payment.status === 'Paid') {
        order.payment.status = 'Refund pending';
      }

      for (const item of order.items) {
        const listing = await Listing.findById(item.listing).session(session);

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

    try {
      await notificationService.notifyOrderStatusChanged(
        cancelledOrder,
        previousStatus
      );
    } catch (error) {
      console.error(
        'Failed to create cancellation notification:',
        error.message
      );
    }

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