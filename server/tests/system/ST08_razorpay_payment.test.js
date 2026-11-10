const crypto = require('crypto');
const request = require('supertest');
const { testApp } = require('../helpers/app');
const { useTestDatabase } = require('../helpers/db');
const { seedMarketplace } = require('../helpers/fixtures');
const { tokenFor, bearer } = require('../helpers/auth');
const { Order, Listing } = require('../../src/models');
const { config } = require('../../src/config/env');
const gateway = require('../../src/services/paymentGateway');

useTestDatabase();

const KEY_ID = 'rzp_test_systemtest';
const KEY_SECRET = 'system_test_secret_value';

// REQ-11 with Razorpay in test mode. The network calls to Razorpay are replaced by an in-memory
// stand-in; signature checking, amounts, ownership and the order/stock transaction run for real.
describe('ST08 Razorpay payment', () => {
  let app;
  let data;
  let buyerAuth;
  let secondBuyerAuth;
  let razorpay;
  const saved = {};

  beforeEach(async () => {
    Object.assign(saved, { provider: config.paymentProvider, id: config.razorpayKeyId, secret: config.razorpayKeySecret });
    config.paymentProvider = 'razorpay';
    config.razorpayKeyId = KEY_ID;
    config.razorpayKeySecret = KEY_SECRET;

    razorpay = { orders: {}, payments: {}, refunds: [] };
    jest.spyOn(gateway, 'authorise').mockImplementation(async (order) => {
      const id = `order_${crypto.randomBytes(7).toString('hex')}`;
      razorpay.orders[id] = {
        id, amount: Math.round(order.totalAmount * 100), currency: 'INR', status: 'created',
        notes: { orderId: order.id, buyerId: String(order.buyer) },
      };
      return razorpay.orders[id];
    });
    jest.spyOn(gateway, 'retrieveOrder').mockImplementation(async (id) => razorpay.orders[id]);
    jest.spyOn(gateway, 'listOrderPayments').mockImplementation(async (id) => razorpay.payments[id] || []);
    jest.spyOn(gateway, 'capturePayment').mockImplementation(async (paymentId) => {
      const payment = Object.values(razorpay.payments).flat().find((p) => p.id === paymentId);
      payment.status = 'captured';
      return payment;
    });
    jest.spyOn(gateway, 'refundPayment').mockImplementation(async (paymentId) => {
      razorpay.refunds.push(paymentId);
      return { id: 'rfnd_test0001', payment_id: paymentId };
    });

    app = testApp();
    data = await seedMarketplace();
    buyerAuth = bearer(await tokenFor(app, data.users['U-B01']));
    secondBuyerAuth = bearer(await tokenFor(app, data.users['U-B02']));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    config.paymentProvider = saved.provider;
    config.razorpayKeyId = saved.id;
    config.razorpayKeySecret = saved.secret;
  });

  const orderId = () => data.orders['ORD-S05']._id.toString(); // U-B01, Placed, L04 x 1, INR 550
  const intent = (auth = buyerAuth, id = orderId()) => request(app).post(`/api/payments/orders/${id}/intent`).set(auth);
  const confirm = (body, auth = buyerAuth, id = orderId()) => request(app).post(`/api/payments/orders/${id}/confirm`).set(auth).send(body);
  const sign = (ref, paymentId) => crypto.createHmac('sha256', KEY_SECRET).update(`${ref}|${paymentId}`).digest('hex');
  function addPayment(ref, status, extra = {}) {
    const payment = { id: `pay_${crypto.randomBytes(7).toString('hex')}`, order_id: ref, amount: razorpay.orders[ref].amount, currency: 'INR', status, created_at: Date.now() / 1000, ...extra };
    razorpay.payments[ref] = [...(razorpay.payments[ref] || []), payment];
    return payment;
  }
  const stockL04 = async () => (await Listing.findById(data.listings.L04._id)).quantity;

  test('TC-RZP-01: the payment configuration gives the browser the key id and never the key secret', async () => {
    const res = await request(app).get('/api/payments/config').set(buyerAuth);

    expect(res.status).toBe(200);
    expect(res.body.payment).toEqual({ provider: 'razorpay', keyId: KEY_ID });
    expect(JSON.stringify(res.body)).not.toContain(KEY_SECRET);
  });

  test('TC-RZP-02: one Razorpay order is created for the order total in paise and reused on retry', async () => {
    const first = await intent();
    const second = await intent();

    expect(first.status).toBe(201);
    expect(first.body.intent).toEqual({ transactionRef: expect.stringMatching(/^order_/), amount: 55000, currency: 'INR' });
    expect(second.body.intent.transactionRef).toBe(first.body.intent.transactionRef);
    expect(gateway.authorise).toHaveBeenCalledTimes(1);
    const order = await Order.findById(orderId());
    expect(order.payment).toMatchObject({ provider: 'razorpay', transactionRef: first.body.intent.transactionRef, status: 'Pending' });
  });

  test('TC-RZP-03: concurrent payment requests end with a single recorded Razorpay order', async () => {
    const [a, b] = await Promise.all([intent(), intent()]);

    expect(a.body.intent.transactionRef).toBe(b.body.intent.transactionRef);
    expect((await Order.findById(orderId())).payment.transactionRef).toBe(a.body.intent.transactionRef);
  });

  test('TC-RZP-04: a signed, captured payment marks the order Paid and keeps the stock reserved', async () => {
    const ref = (await intent()).body.intent.transactionRef;
    const payment = addPayment(ref, 'captured');

    const res = await confirm({ transactionRef: ref, paymentId: payment.id, signature: sign(ref, payment.id) });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('Paid');
    expect(res.body.order.payment).toMatchObject({ provider: 'razorpay', transactionRef: ref, status: 'Paid' });
    expect(res.body.order.statusHistory.at(-1).status).toBe('Paid');
    expect(await stockL04()).toBe(10);
    expect(JSON.stringify(res.body)).not.toContain(KEY_SECRET);
  });

  test('TC-RZP-05: a forged signature is refused before the gateway is asked, and the order is unchanged', async () => {
    const ref = (await intent()).body.intent.transactionRef;
    const payment = addPayment(ref, 'captured');
    gateway.retrieveOrder.mockClear();

    const res = await confirm({ transactionRef: ref, paymentId: payment.id, signature: 'f'.repeat(64) });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('The payment could not be verified.');
    expect(gateway.retrieveOrder).not.toHaveBeenCalled();
    expect((await Order.findById(orderId())).status).toBe('Placed');
  });

  test('TC-RZP-06: an authorised payment is captured for the order amount, then the order is Paid', async () => {
    const ref = (await intent()).body.intent.transactionRef;
    const payment = addPayment(ref, 'authorized');

    const res = await confirm({ transactionRef: ref, paymentId: payment.id, signature: sign(ref, payment.id) });

    expect(res.status).toBe(200);
    expect(gateway.capturePayment).toHaveBeenCalledWith(payment.id, 55000, 'INR');
    expect(res.body.order.status).toBe('Paid');
  });

  test('TC-RZP-07: a gateway amount that differs from the order total is refused', async () => {
    const ref = (await intent()).body.intent.transactionRef;
    razorpay.orders[ref].amount = 100;
    const payment = addPayment(ref, 'captured');

    const res = await confirm({ transactionRef: ref, paymentId: payment.id, signature: sign(ref, payment.id) });

    expect(res.status).toBe(409);
    expect((await Order.findById(orderId())).status).toBe('Placed');
  });

  test('TC-RZP-08: another buyer cannot confirm or open a payment for this order', async () => {
    const ref = (await intent()).body.intent.transactionRef;
    const payment = addPayment(ref, 'captured');

    const confirmRes = await confirm({ transactionRef: ref, paymentId: payment.id, signature: sign(ref, payment.id) }, secondBuyerAuth);
    const intentRes = await intent(secondBuyerAuth);

    expect(confirmRes.status).toBe(404);
    expect(intentRes.status).toBe(404);
    expect((await Order.findById(orderId())).status).toBe('Placed');
  });

  test('TC-RZP-09: a failed payment then closing Checkout cancels the order, records the reason and releases stock', async () => {
    const ref = (await intent()).body.intent.transactionRef;
    addPayment(ref, 'failed', { error_description: 'Your payment has been cancelled. Try again or complete the payment later.' });

    const res = await confirm({ transactionRef: ref, failure: true });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('Cancelled');
    expect(res.body.order.payment).toMatchObject({ status: 'Failed', failureReason: 'Your payment has been cancelled. Try again or complete the payment later.' });
    expect(await stockL04()).toBe(11);
  });

  test('TC-RZP-10: checking status before any payment leaves the order waiting for payment', async () => {
    const ref = (await intent()).body.intent.transactionRef;

    const res = await confirm({ transactionRef: ref });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('No completed payment has been received for this order yet.');
    expect((await Order.findById(orderId())).status).toBe('Placed');
  });

  test('TC-RZP-11: a payment that arrives after the order was cancelled is refunded', async () => {
    const ref = (await intent()).body.intent.transactionRef;
    expect((await request(app).post(`/api/orders/${orderId()}/cancel`).set(buyerAuth)).status).toBe(200);
    const payment = addPayment(ref, 'captured');

    const res = await confirm({ transactionRef: ref, paymentId: payment.id, signature: sign(ref, payment.id) });

    expect(res.status).toBe(409);
    expect(razorpay.refunds).toEqual([payment.id]);
    const order = await Order.findById(orderId());
    expect(order.status).toBe('Cancelled');
    expect(order.payment.status).toBe('Refunded');
  });

  test('TC-RZP-12: confirming a paid order again changes nothing and captures nothing', async () => {
    const ref = (await intent()).body.intent.transactionRef;
    const payment = addPayment(ref, 'captured');
    const body = { transactionRef: ref, paymentId: payment.id, signature: sign(ref, payment.id) };
    await confirm(body);

    const again = await confirm(body);

    expect(again.status).toBe(200);
    expect(again.body.order.status).toBe('Paid');
    expect(again.body.order.statusHistory.filter((h) => h.status === 'Paid')).toHaveLength(1);
    expect(gateway.capturePayment).not.toHaveBeenCalled();
  });

  test('TC-RZP-13: malformed references and half-sent payment details are rejected', async () => {
    const ref = (await intent()).body.intent.transactionRef;

    expect((await confirm({ transactionRef: 'pi_stripe_style' })).status).toBe(400);
    expect((await confirm({ transactionRef: ref, paymentId: 'pay_abcdef123' })).status).toBe(400);
    expect((await confirm({ transactionRef: ref, paymentId: 'not-a-payment', signature: 'x' })).status).toBe(400);
  });

  test('TC-RZP-14: with the simulator configured, the Razorpay routes are not available', async () => {
    config.paymentProvider = 'simulator';

    expect((await intent()).status).toBe(404);
    expect((await confirm({ transactionRef: 'order_abcdef123' })).status).toBe(404);
  });
});
