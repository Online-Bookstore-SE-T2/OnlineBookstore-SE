const mongoose = require('mongoose');
const { Order, Listing, User } = require('../models');
const { ORDER_STATUS, ORDER_STATUS_TRANSITIONS, ADMIN_ORDER_STATUS_TRANSITIONS } = require('../constants');
const { AppError } = require('../utils/errors');
const strings = require('../resources/strings');
const notificationService = require('./notificationService');
const emailService = require('./emailService');
const { demoAutoDeliverDelayMs } = require('../config/env');

// Returns an order's quantities to its listings. Must run inside the caller's transaction.
async function releaseOrderStock(order, session) {
  for (const item of order.items) {
    const listing = await Listing.findById(item.listing).session(session);

    if (!listing) {
      throw new AppError(
        409,
        strings.order.listingMissing
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
    throw new AppError(400, strings.order.invalidId);
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
    throw new AppError(404, strings.order.notFound);
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
    throw new AppError(400, strings.order.invalidId);
  }
  if (![ORDER_STATUS.SHIPPED, ORDER_STATUS.DELIVERED].includes(nextStatus)) {
    throw new AppError(400, strings.order.sellerStatusRestriction);
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

      if (!order) throw new AppError(404, strings.order.notFound);
      if (!ORDER_STATUS_TRANSITIONS[order.status]?.includes(nextStatus)) {
        throw new AppError(409, strings.order.invalidTransition(order.status, nextStatus));
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
    throw new AppError(400, strings.order.invalidId);
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
        throw new AppError(404, strings.order.notFound);
      }

      // SRS 6.2: a buyer may cancel only before the order reaches Shipped.
      if (!ORDER_STATUS_TRANSITIONS[order.status]?.includes(ORDER_STATUS.CANCELLED)) {
        throw new AppError(
          409,
          strings.order.cannotCancelShipped
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

// REQ-4, SASD 4.2.4: an administrator moves an order along ADMIN_ORDER_STATUS_TRANSITIONS.
// Cancelling restores the stock in the same transaction and marks a payment as owed back.
// The buyer is notified of every change, and the sellers of a cancellation.
async function adminSetOrderStatus(adminId, orderId, nextStatus) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new AppError(400, strings.order.invalidId);
  }

  const session = await mongoose.startSession();
  let updatedOrder;
  let previousStatus;

  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({ _id: orderId, deletedAt: null }).session(session);

      if (!order) throw new AppError(404, strings.order.notFound);
      if (nextStatus === ORDER_STATUS.PAID) {
        throw new AppError(409, strings.order.paidRequiresConfirmedPayment);
      }
      if (!ADMIN_ORDER_STATUS_TRANSITIONS[order.status]?.includes(nextStatus)) {
        throw new AppError(409, strings.order.invalidTransition(order.status, nextStatus));
      }

      previousStatus = order.status;
      if (nextStatus === ORDER_STATUS.CANCELLED) {
        // Refunds are outside Release 1.0; record that one is owed.
        if (order.payment && order.payment.status === 'Paid') {
          order.payment.status = 'Refund pending';
        }
        await releaseOrderStock(order, session);
      }

      order.status = nextStatus;
      order.statusHistory.push({
        status: nextStatus,
        actor: adminId,
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
    nextStatus === ORDER_STATUS.CANCELLED
      && notificationService.notifySellersOrderCancelled(updatedOrder)
        .catch((error) => console.error('Failed to create seller cancellation notifications:', error.message)),
    User.findById(updatedOrder.buyer)
      .then((buyer) => buyer && emailService.dispatchOrderEvent('status', updatedOrder, buyer))
      .catch((error) => console.error('Failed to load order email recipient:', error.message)),
  ]);
  return { order: updatedOrder, previousStatus };
}

// Hosted-demo auto-delivery (DEMO_AUTO_DELIVER_SECONDS, a recorded SRS deviation).

// When a paid order will be delivered automatically, or null when that does not apply.
function demoAutoDeliverAt(order) {
  const delayMs = demoAutoDeliverDelayMs();
  if (!delayMs || order.status !== ORDER_STATUS.PAID) return null;
  const paid = [...(order.statusHistory || [])].reverse().find((entry) => entry.status === ORDER_STATUS.PAID);
  return paid ? new Date(new Date(paid.changedAt).getTime() + delayMs) : null;
}

// Marks every order paid at least DEMO_AUTO_DELIVER_SECONDS ago as Shipped and then Delivered,
// recording both steps under the seller of its first item. The update only applies to an order
// that is still Paid, so a cancellation in the meantime wins, and several server instances can
// run this at once without delivering an order twice.
async function deliverDueDemoOrders(now = new Date()) {
  const delayMs = demoAutoDeliverDelayMs();
  if (!delayMs) return [];
  const cutoff = new Date(now.getTime() - delayMs);
  const due = await Order.find({
    status: ORDER_STATUS.PAID,
    deletedAt: null,
    // Trusted: the filter is built here from server values, not from the request (sanitizeFilter).
    statusHistory: mongoose.trusted({ $elemMatch: { status: ORDER_STATUS.PAID, changedAt: { $lte: cutoff } } }),
  }).select('_id items.seller');

  const delivered = [];
  for (const candidate of due) {
    const actor = candidate.items[0].seller;
    const order = await Order.findOneAndUpdate(
      { _id: candidate._id, status: ORDER_STATUS.PAID, deletedAt: null },
      {
        $set: { status: ORDER_STATUS.DELIVERED },
        $push: {
          statusHistory: {
            $each: [
              { status: ORDER_STATUS.SHIPPED, actor, changedAt: now },
              { status: ORDER_STATUS.DELIVERED, actor, changedAt: now },
            ],
          },
        },
      },
      { new: true },
    );
    if (!order) continue;
    delivered.push(order);
    await Promise.all([
      notificationService.notifyOrderStatusChanged(order, ORDER_STATUS.PAID)
        .catch((error) => console.error('Failed to create order status notification:', error.message)),
      User.findById(order.buyer)
        .then((buyer) => buyer && emailService.dispatchOrderEvent('status', order, buyer))
        .catch((error) => console.error('Failed to load order email recipient:', error.message)),
    ]);
  }
  return delivered;
}

// Runs deliverDueDemoOrders every intervalMs while demo auto-delivery is on. Returns a stop function.
function startDemoAutoDelivery(intervalMs = 2000) {
  if (!demoAutoDeliverDelayMs()) return () => {};
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await deliverDueDemoOrders();
    } catch (error) {
      console.error('Demo auto-delivery failed:', error.message);
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = {
  demoAutoDeliverAt,
  deliverDueDemoOrders,
  startDemoAutoDelivery,
  getBuyerOrders,
  getBuyerOrder,
  getSellerOrders,
  advanceSellerOrder,
  cancelBuyerOrder,
  adminSetOrderStatus,
  releaseOrderStock,
};
