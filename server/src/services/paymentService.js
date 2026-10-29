const mongoose = require('mongoose');
const Order = require('../models/Order');
const { ORDER_STATUS, ORDER_STATUS_TRANSITIONS } = require('../constants');
const { AppError } = require('../utils/errors');
const { config } = require('../config/env');
const notificationService = require('./notificationService');
const emailService = require('./emailService');
const paymentGateway = require('./paymentGateway');
const { releaseOrderStock } = require('./orderService');
const { User } = require('../models');

async function findBuyerOrder(userId, orderId, session) {
  const query = Order.findOne({ _id: orderId, buyer: userId, deletedAt: null });
  return session ? query.session(session) : query;
}

function assertPayable(order) {
  if (order.status === ORDER_STATUS.CANCELLED) {
    throw new AppError(409, 'Cannot pay for a cancelled order.');
  }
  if (order.status === ORDER_STATUS.PAID || order.payment?.status === 'Paid') {
    throw new AppError(409, 'This order has already been paid.');
  }
  if (order.status !== ORDER_STATUS.PLACED) {
    throw new AppError(409, 'This order cannot be paid in its current state.');
  }
}

function assertTransition(order, nextStatus) {
  if (!ORDER_STATUS_TRANSITIONS[order.status]?.includes(nextStatus)) {
    throw new AppError(409, `An order cannot move from ${order.status} to ${nextStatus}.`);
  }
}

async function notifyPaymentFinished(order, previousStatus, succeeded) {
  const tasks = [
    notificationService.notifyPaymentOutcome(order, succeeded),
    notificationService.notifyOrderStatusChanged(order, previousStatus),
  ];
  if (!succeeded) tasks.push(notificationService.notifySellersOrderCancelled(order));
  await Promise.all(tasks.map((task) => task.catch((error) => {
    console.error('Failed to create payment notification:', error.message);
  })));
  try {
    const buyer = await User.findById(order.buyer);
    if (buyer) emailService.dispatchOrderEvent('payment', order, buyer);
  } catch (error) {
    console.error('Failed to load order email recipient:', error.message);
  }
}

async function createPaymentIntent(userId, orderId) {
  if (config.paymentProvider !== 'stripe') {
    throw new AppError(404, 'Stripe payments are not enabled.');
  }
  if (!mongoose.isValidObjectId(orderId)) throw new AppError(400, 'Invalid order ID.');

  const order = await findBuyerOrder(userId, orderId);
  if (!order) throw new AppError(404, 'Order not found.');
  assertPayable(order);

  const intent = await paymentGateway.authorise(order);
  order.payment = {
    provider: 'stripe',
    transactionRef: intent.id,
    status: 'Pending',
  };
  await order.save();
  return { clientSecret: intent.client_secret, transactionRef: intent.id };
}

async function completeStripePayment(userId, orderId, transactionRef, failureRequested = false) {
  if (config.paymentProvider !== 'stripe') {
    throw new AppError(404, 'Stripe payments are not enabled.');
  }
  if (!mongoose.isValidObjectId(orderId)) throw new AppError(400, 'Invalid order ID.');
  if (typeof transactionRef !== 'string' || transactionRef.length > 200) {
    throw new AppError(400, 'A valid payment reference is required.');
  }

  let intent = await paymentGateway.retrieve(transactionRef);
  if (failureRequested && intent.status !== 'succeeded' && intent.status !== 'canceled') {
    intent = await paymentGateway.cancel(transactionRef);
  }

  const orderBefore = await findBuyerOrder(userId, orderId);
  if (!orderBefore || orderBefore.payment?.transactionRef !== intent.id) {
    throw new AppError(404, 'Payment intent not found for this order.');
  }
  if (intent.metadata?.orderId !== orderBefore.id || intent.metadata?.buyerId !== String(userId)) {
    throw new AppError(404, 'Payment intent not found for this order.');
  }
  if (intent.amount !== Math.round(orderBefore.totalAmount * 100) || intent.currency !== 'inr') {
    throw new AppError(409, 'The payment amount does not match this order.');
  }

  if (!['succeeded', 'requires_payment_method', 'canceled'].includes(intent.status)) {
    throw new AppError(409, 'The payment is still processing. Check again before retrying.');
  }

  const succeeded = intent.status === 'succeeded';
  const session = await mongoose.startSession();
  let updatedOrder;
  let previousStatus;

  try {
    await session.withTransaction(async () => {
      const order = await findBuyerOrder(userId, orderId, session);
      if (!order) throw new AppError(404, 'Order not found.');
      if (order.payment?.transactionRef !== intent.id) {
        throw new AppError(409, 'The payment reference has changed.');
      }
      if (order.payment.status === 'Paid') {
        updatedOrder = order;
        return;
      }
      assertPayable(order);
      previousStatus = order.status;
      if (succeeded) {
        assertTransition(order, ORDER_STATUS.PAID);
        order.payment.status = 'Paid';
        order.payment.failureReason = undefined;
        order.status = ORDER_STATUS.PAID;
      } else {
        assertTransition(order, ORDER_STATUS.CANCELLED);
        order.payment.status = 'Failed';
        order.payment.failureReason = intent.last_payment_error?.message || 'Payment was not completed.';
        await releaseOrderStock(order, session);
        order.status = ORDER_STATUS.CANCELLED;
      }
      order.statusHistory.push({ status: order.status, actor: userId, changedAt: new Date() });
      await order.save({ session });
      updatedOrder = order;
    });
  } finally {
    await session.endSession();
  }

  if (previousStatus) await notifyPaymentFinished(updatedOrder, previousStatus, succeeded);
  return updatedOrder;
}

async function simulatePayment(userId, orderId, outcome) {
  if (config.env === 'production' || config.paymentProvider !== 'simulator') {
    throw new AppError(404, 'Payment simulator not found.');
  }
  if (!mongoose.isValidObjectId(orderId)) throw new AppError(400, 'Invalid order ID.');
  if (!['success', 'failure'].includes(outcome)) {
    throw new AppError(400, 'Outcome must be success or failure.');
  }

  const session = await mongoose.startSession();
  let order;
  let previousStatus;
  try {
    await session.withTransaction(async () => {
      order = await findBuyerOrder(userId, orderId, session);
      if (!order) throw new AppError(404, 'Order not found.');
      assertPayable(order);
      const result = await paymentGateway.authorise(order, { outcome });
      previousStatus = order.status;
      order.payment = outcome === 'success'
        ? { provider: 'simulator', transactionRef: result.id, status: 'Paid' }
        : { provider: 'simulator', status: 'Failed', failureReason: 'Simulated payment failure.' };

      if (outcome === 'success') {
        assertTransition(order, ORDER_STATUS.PAID);
        order.status = ORDER_STATUS.PAID;
      } else {
        assertTransition(order, ORDER_STATUS.CANCELLED);
        await releaseOrderStock(order, session);
        order.status = ORDER_STATUS.CANCELLED;
      }
      order.statusHistory.push({ status: order.status, actor: userId, changedAt: new Date() });
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }

  await notifyPaymentFinished(order, previousStatus, outcome === 'success');
  return order;
}

function getPaymentConfiguration() {
  if (config.paymentProvider === 'stripe' && !config.stripePublishableKey) {
    throw new AppError(503, 'Stripe sandbox payments are not fully configured.');
  }
  return {
    provider: config.paymentProvider,
    publishableKey: config.paymentProvider === 'stripe' ? config.stripePublishableKey : null,
  };
}

module.exports = {
  createPaymentIntent,
  completeStripePayment,
  simulatePayment,
  getPaymentConfiguration,
};
