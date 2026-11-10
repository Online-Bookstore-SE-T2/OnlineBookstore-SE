const crypto = require('crypto');
const { config } = require('../config/env');
const { AppError } = require('../utils/errors');
const strings = require('../resources/strings');

// Razorpay adapter (REQ-11). Only the server talks to the gateway with the key secret; the
// browser gets the public key id and the Razorpay order id (SRS 6.3).
const API_BASE = 'https://api.razorpay.com/v1';
const TIMEOUT_MS = 10000;

function authorisationHeader() {
  if (config.paymentProvider !== 'razorpay' || !config.razorpayKeyId || !config.razorpayKeySecret) {
    throw new AppError(503, strings.payment.gatewayNotConfigured);
  }
  const token = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString('base64');
  return `Basic ${token}`;
}

async function request(method, path, body) {
  const authorization = authorisationHeader();
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: authorization,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error(`[payment] Razorpay ${method} ${path} could not be reached: ${error.message}`);
    throw new AppError(502, strings.payment.gatewayUnavailable);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Log the gateway's code and description only; never the request headers.
    console.error(`[payment] Razorpay ${method} ${path} -> ${response.status} ${data?.error?.code || ''} ${data?.error?.description || ''}`.trim());
    throw new AppError(502, strings.payment.gatewayRejected);
  }
  return data;
}

function toPaise(amount) {
  return Math.round(amount * 100);
}

// Creates the gateway-side record for an order: a Razorpay order in test mode, or a
// simulated authorisation when PAYMENT_PROVIDER=simulator.
async function authorise(order, { outcome } = {}) {
  if (config.paymentProvider === 'razorpay') {
    return request('POST', '/orders', {
      amount: toPaise(order.totalAmount),
      currency: 'INR',
      receipt: `order-${order.id}`,
      notes: { orderId: order.id, buyerId: String(order.buyer) },
    });
  }
  return {
    id: `SIM-${crypto.randomUUID()}`,
    status: outcome === 'success' ? 'succeeded' : 'failed',
  };
}

async function retrieveOrder(razorpayOrderId) {
  return request('GET', `/orders/${encodeURIComponent(razorpayOrderId)}`);
}

async function listOrderPayments(razorpayOrderId) {
  const result = await request('GET', `/orders/${encodeURIComponent(razorpayOrderId)}/payments`);
  return Array.isArray(result.items) ? result.items : [];
}

async function capturePayment(paymentId, amountPaise, currency = 'INR') {
  return request('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency });
}

async function refundPayment(paymentId, notes = {}) {
  return request('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, { notes });
}

// Razorpay signs `order_id|payment_id` with the key secret (HMAC-SHA256, hex).
function verifySignature(razorpayOrderId, paymentId, signature) {
  if (!config.razorpayKeySecret || typeof signature !== 'string') return false;
  const expected = crypto
    .createHmac('sha256', config.razorpayKeySecret)
    .update(`${razorpayOrderId}|${paymentId}`)
    .digest('hex');
  const given = Buffer.from(signature, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return given.length === wanted.length && crypto.timingSafeEqual(given, wanted);
}

module.exports = {
  authorise,
  retrieveOrder,
  listOrderPayments,
  capturePayment,
  refundPayment,
  verifySignature,
  toPaise,
};
