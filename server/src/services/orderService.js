const mongoose = require('mongoose');
const { Order, Listing, User } = require('../models');
const { ORDER_STATUS, ORDER_STATUS_TRANSITIONS } = require('../constants');
const { AppError } = require('../utils/errors');
const notificationService = require('./notificationService');
const emailService = require('./emailService');

// Returns an order's quantities to its listings. Must run inside the caller's transaction.
async function releaseOrderStock(order, session) {
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
}

async function getBuyerOrders(userId) {
  return Order.find({
    buyer: userId,
    deletedAt: null,
  })
    .populate('items.book', 'title author isbn')
    .populate('items.seller', 'name')
    .populate('statusHistory.actor', 'name')
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
    .populate('items.seller', 'name')
    .populate('statusHistory.actor', 'name');

  if (!order) {
    throw new AppError(404, 'Order not found.');
  }

  return order;
}

async function getSellerOrders(userId) {
  const orders = await Order.find({
    'items.seller': userId,
    deletedAt: null,
  })
    .populate('buyer', 'name')
    .populate('items.book', 'title author isbn')
    .populate('items.seller', 'name')
    .populate('statusHistory.actor', 'name')
    .sort({ createdAt: -1 });

  return orders.map((order) => {
    const sellerOrder = order.toJSON();
    sellerOrder.items = sellerOrder.items.filter((item) => item.seller.id === String(userId));
    sellerOrder.totalAmount = Math.round(sellerOrder.items.reduce(
      (total, item) => total + Math.round(item.unitPrice * 100) * item.quantity,
      0,
    )) / 100;
    delete sellerOrder.payment;
    return sellerOrder;
  });
}

async function advanceSellerOrder(userId, orderId, nextStatus) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new AppError(400, 'Invalid order ID.');
  }
  if (![ORDER_STATUS.SHIPPED, ORDER_STATUS.DELIVERED].includes(nextStatus)) {
    throw new AppError(400, 'Sellers may only mark orders Shipped or Delivered.');
  }

  const session = await mongoose.startSession();
  let updatedOrder;
  let previousStatus;

  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({
        _id: orderId,
        'items.seller': userId,
        deletedAt: null,
      }).session(session);

      if (!order) throw new AppError(404, 'Order not found.');
      if (!ORDER_STATUS_TRANSITIONS[order.status]?.includes(nextStatus)) {
        throw new AppError(409, `An order cannot move from ${order.status} to ${nextStatus}.`);
      }

      previousStatus = order.status;
      order.status = nextStatus;
      order.statusHistory.push({
        status: nextStatus,
        actor: userId,
        changedAt: new Date(),
      });
      await order.save({ session });
      updatedOrder = order;
    });
  } finally {
    await session.endSession();
  }

  await Promise.all([
    notificationService.notifyOrderStatusChanged(updatedOrder, previousStatus)
      .catch((error) => console.error('Failed to create order status notification:', error.message)),
    User.findById(updatedOrder.buyer)
      .then((buyer) => buyer && emailService.dispatchOrderEvent('status', updatedOrder, buyer))
      .catch((error) => console.error('Failed to load order email recipient:', error.message)),
  ]);
  return updatedOrder;
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
      if (!ORDER_STATUS_TRANSITIONS[order.status]?.includes(ORDER_STATUS.CANCELLED)) {
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

      await releaseOrderStock(order, session);

      order.status = ORDER_STATUS.CANCELLED;
      order.statusHistory.push({
        status: ORDER_STATUS.CANCELLED,
        actor: userId,
        changedAt: new Date(),
      });
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
    await notificationService.notifySellersOrderCancelled(cancelledOrder).catch((error) => {
      console.error('Failed to create seller cancellation notifications:', error.message);
    });
    User.findById(cancelledOrder.buyer)
      .then((buyer) => buyer && emailService.dispatchOrderEvent('status', cancelledOrder, buyer))
      .catch((error) => console.error('Failed to load order email recipient:', error.message));

    return cancelledOrder;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  getBuyerOrders,
  getBuyerOrder,
  getSellerOrders,
  advanceSellerOrder,
  cancelBuyerOrder,
  releaseOrderStock,
};