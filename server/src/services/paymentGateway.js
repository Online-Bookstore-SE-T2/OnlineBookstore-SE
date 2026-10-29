const Stripe = require('stripe');
const { randomUUID } = require('crypto');
const { config } = require('../config/env');
const { AppError } = require('../utils/errors');

let stripeClient;

function stripe() {
  if (config.paymentProvider !== 'stripe' || !config.stripeSecretKey) {
    throw new AppError(503, 'Stripe sandbox payments are not configured.');
  }
  if (!stripeClient) stripeClient = new Stripe(config.stripeSecretKey);
  return stripeClient;
}

async function authorise(order, { outcome } = {}) {
  if (config.paymentProvider === 'stripe') {
    return stripe().paymentIntents.create({
      amount: Math.round(order.totalAmount * 100),
      currency: 'inr',
      payment_method_types: ['card'],
      metadata: { orderId: order.id, buyerId: String(order.buyer) },
    }, { idempotencyKey: `order-${order.id}` });
  }
  return {
    id: `SIM-${randomUUID()}`,
    clientSecret: null,
    status: outcome === 'success' ? 'succeeded' : 'failed',
  };
}

async function retrieve(transactionRef) {
  return stripe().paymentIntents.retrieve(transactionRef);
}

async function cancel(transactionRef) {
  return stripe().paymentIntents.cancel(transactionRef);
}

module.exports = { authorise, retrieve, cancel };
