const mongoose = require('mongoose');
const Order = require('../models/Order');
const { ORDER_STATUS, ORDER_STATUS_TRANSITIONS } = require('../constants');
const { AppError } = require('../utils/errors');
const strings = require('../resources/strings');
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
    throw new AppError(409, strings.payment.cancelledOrder);
  }
  if (order.status === ORDER_STATUS.PAID || order.payment?.status === 'Paid') {
    throw new AppError(409, strings.payment.alreadyPaid);
  }
  if (order.status !== ORDER_STATUS.PLACED) {
    throw new AppError(409, strings.payment.unpayableOrder);
  }
}

function assertTransition(order, nextStatus) {
  if (!ORDER_STATUS_TRANSITIONS[order.status]?.includes(nextStatus)) {
    throw new AppError(409, strings.order.invalidTransition(order.status, nextStatus));
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

// The browser needs the Razorpay order id, amount and currency to open Checkout.
function intentFor(gatewayOrder) {
  return { transactionRef: gatewayOrder.id, amount: gatewayOrder.amount, currency: gatewayOrder.currency };
}

async function createPaymentIntent(userId, orderId) {
  if (config.paymentProvider !== 'razorpay') {
    throw new AppError(404, strings.payment.gatewayNotEnabled);
  }
  if (!mongoose.isValidObjectId(orderId)) throw new AppError(400, strings.order.invalidId);

  const order = await findBuyerOrder(userId, orderId);
  if (!order) throw new AppError(404, strings.order.notFound);
  assertPayable(order);

  // One Razorpay order per bookstore order: a retry reuses it instead of opening another.
  if (order.payment?.provider === 'razorpay' && order.payment.transactionRef) {
    return intentFor(await paymentGateway.retrieveOrder(order.payment.transactionRef));
  }

  const gatewayOrder = await paymentGateway.authorise(order);
  // Record it only if no concurrent request (a second tab, a double click) recorded one first.
  const claimed = await Order.updateOne(
    { _id: order._id, buyer: userId, status: ORDER_STATUS.PLACED, 'payment.transactionRef': null },
    { $set: { payment: { provider: 'razorpay', transactionRef: gatewayOrder.id, status: 'Pending' } } },
  );
  if (claimed.modifiedCount !== 1) {
    const current = await findBuyerOrder(userId, orderId);
    if (current?.payment?.provider === 'razorpay' && current.payment.transactionRef) {
      return intentFor(await paymentGateway.retrieveOrder(current.payment.transactionRef));
    }
    throw new AppError(409, strings.payment.unpayableOrder);
  }
  return intentFor(gatewayOrder);
}

const GATEWAY_ORDER_ID = /^order_[A-Za-z0-9]{6,40}$/;
const GATEWAY_PAYMENT_ID = /^pay_[A-Za-z0-9]{6,40}$/;

// Settles an order from the gateway's own records. The browser's success callback is only a
// hint: its signature is checked, and the outcome is read from Razorpay with the key secret.
async function completeGatewayPayment(userId, orderId, details = {}) {
  const { transactionRef, paymentId, signature, failure = false } = details;
  if (config.paymentProvider !== 'razorpay') {
    throw new AppError(404, strings.payment.gatewayNotEnabled);
  }
  if (!mongoose.isValidObjectId(orderId)) throw new AppError(400, strings.order.invalidId);
  if (typeof transactionRef !== 'string' || !GATEWAY_ORDER_ID.test(transactionRef)) {
    throw new AppError(400, strings.payment.validReference);
  }
  if (Boolean(paymentId) !== Boolean(signature)) {
    throw new AppError(400, strings.payment.paymentDetailsTogether);
  }
  if (paymentId) {
    if (typeof paymentId !== 'string' || !GATEWAY_PAYMENT_ID.test(paymentId)) {
      throw new AppError(400, strings.payment.validReference);
    }
    if (!paymentGateway.verifySignature(transactionRef, paymentId, signature)) {
      throw new AppError(400, strings.payment.invalidSignature);
    }
  }

  const orderBefore = await findBuyerOrder(userId, orderId);
  if (!orderBefore || orderBefore.payment?.provider !== 'razorpay' || orderBefore.payment.transactionRef !== transactionRef) {
    throw new AppError(404, strings.payment.intentNotFound);
  }

  const gatewayOrder = await paymentGateway.retrieveOrder(transactionRef);
  if (gatewayOrder.notes?.orderId !== orderBefore.id || gatewayOrder.notes?.buyerId !== String(userId)) {
    throw new AppError(404, strings.payment.intentNotFound);
  }
  const expectedPaise = paymentGateway.toPaise(orderBefore.totalAmount);
  if (gatewayOrder.amount !== expectedPaise || gatewayOrder.currency !== 'INR') {
    throw new AppError(409, strings.payment.amountMismatch);
  }

  const payments = (await paymentGateway.listOrderPayments(transactionRef))
    .slice()
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

  // A payment that reaches an order already cancelled (and its stock released) is refunded,
  // so the buyer is never charged for an order that will not be fulfilled.
  if (orderBefore.status === ORDER_STATUS.CANCELLED) {
    const captured = payments.filter((p) => p.status === 'captured');
    if (captured.length === 0) throw new AppError(409, strings.payment.cancelledOrder);
    if (orderBefore.payment.status !== 'Refunded') {
      for (const payment of captured) {
        await paymentGateway.refundPayment(payment.id, { orderId: orderBefore.id });
      }
      orderBefore.payment.status = 'Refunded';
      orderBefore.payment.failureReason = strings.payment.refundedAfterCancel;
      await orderBefore.save();
    }
    throw new AppError(409, strings.payment.refundedAfterCancel);
  }

  let paid = payments.find((p) => p.status === 'captured');
  if (!paid) {
    const authorised = payments.find((p) => p.status === 'authorized');
    if (authorised) paid = await paymentGateway.capturePayment(authorised.id, expectedPaise, 'INR');
  }
  if (paid && (paid.amount !== expectedPaise || paid.currency !== 'INR')) {
    throw new AppError(409, strings.payment.amountMismatch);
  }
  if (!paid && !failure) {
    throw new AppError(409, strings.payment.noCompletedPayment);
  }

  const succeeded = Boolean(paid);
  const failureReason = payments.find((p) => p.status === 'failed')?.error_description || 'Payment was not completed.';
  const session = await mongoose.startSession();
  let updatedOrder;
  let previousStatus;

  try {
    await session.withTransaction(async () => {
      const order = await findBuyerOrder(userId, orderId, session);
      if (!order) throw new AppError(404, strings.order.notFound);
      if (order.payment?.transactionRef !== transactionRef) {
        throw new AppError(409, strings.payment.referenceChanged);
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
        order.payment.failureReason = failureReason;
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
  const simulatorAllowed = config.env !== 'production' || config.allowPaymentSimulator;
  if (!simulatorAllowed || config.paymentProvider !== 'simulator') {
    throw new AppError(404, strings.payment.simulatorNotFound);
  }
  if (!mongoose.isValidObjectId(orderId)) throw new AppError(400, strings.order.invalidId);
  if (!['success', 'failure'].includes(outcome)) {
    throw new AppError(400, strings.payment.invalidOutcome);
  }

  const session = await mongoose.startSession();
  let order;
  let previousStatus;
  try {
    await session.withTransaction(async () => {
      order = await findBuyerOrder(userId, orderId, session);
      if (!order) throw new AppError(404, strings.order.notFound);
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
  if (config.paymentProvider === 'razorpay' && !config.razorpayKeyId) {
    throw new AppError(503, strings.payment.gatewayIncomplete);
  }
  return {
    provider: config.paymentProvider,
    keyId: config.paymentProvider === 'razorpay' ? config.razorpayKeyId : null,
  };
}

module.exports = {
  createPaymentIntent,
  completeGatewayPayment,
  simulatePayment,
  getPaymentConfiguration,
};
