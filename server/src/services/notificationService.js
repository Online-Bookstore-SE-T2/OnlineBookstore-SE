const mongoose = require('mongoose');
const { Notification } = require('../models');
const { AppError } = require('../utils/errors');

async function createNotification({
  recipient,
  type,
  title,
  message,
  relatedOrder = null,
}) {
  return Notification.create({
    recipient,
    type,
    title,
    message,
    relatedOrder,
  });
}

async function getNotifications(userId, { unreadOnly = false } = {}) {
  const filter = { recipient: userId };

  if (unreadOnly) {
    filter.readAt = null;
  }

  return Notification.find(filter)
    .populate('relatedOrder', 'status totalAmount createdAt')
    .sort({ createdAt: -1 });
}

async function markNotificationAsRead(userId, notificationId) {
  if (!mongoose.isValidObjectId(notificationId)) {
    throw new AppError(400, 'Invalid notification ID.');
  }

  const notification = await Notification.findOne({
    _id: notificationId,
    recipient: userId,
  });

  if (!notification) {
    throw new AppError(404, 'Notification not found.');
  }

  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }

  return notification;
}

async function notifyOrderPlaced(order) {
  return createNotification({
    recipient: order.buyer,
    type: 'ORDER_PLACED',
    title: 'Order placed successfully',
    message: `Your order ${order._id} has been placed.`,
    relatedOrder: order._id,
  });
}

async function notifyPaymentOutcome(order, success) {
  return createNotification({
    recipient: order.buyer,
    type: success ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED',
    title: success ? 'Payment successful' : 'Payment failed',
    message: success
      ? `Payment for order ${order._id} was successful.`
      : `Payment for order ${order._id} failed.`,
    relatedOrder: order._id,
  });
}

async function notifyOrderStatusChanged(order, previousStatus) {
  if (order.status === previousStatus) {
    return null;
  }

  return createNotification({
    recipient: order.buyer,
    type: 'ORDER_STATUS_CHANGED',
    title: 'Order status updated',
    message: `Your order ${order._id} status changed from ${previousStatus} to ${order.status}.`,
    relatedOrder: order._id,
  });
}

module.exports = {
  createNotification,
  getNotifications,
  markNotificationAsRead,
  notifyOrderPlaced,
  notifyPaymentOutcome,
  notifyOrderStatusChanged,
};