const request = require('supertest');
const { testApp } = require('../helpers/app');
const { useTestDatabase } = require('../helpers/db');
const { seedMarketplace } = require('../helpers/fixtures');
const { tokenFor, bearer } = require('../helpers/auth');
const { Order, Listing } = require('../../src/models');

useTestDatabase();

describe('ST08 Payment Simulation', () => {
  let app;
  let data;
  let buyerAuth;
  let secondBuyerAuth;

  beforeEach(async () => {
    app = testApp();
    data = await seedMarketplace();

    buyerAuth = bearer(await tokenFor(app, data.users['U-B01']));
    secondBuyerAuth = bearer(await tokenFor(app, data.users['U-B02']));
  });

  async function pay(orderId, outcome, auth = buyerAuth) {
    return request(app)
      .post(`/api/payments/orders/${orderId}/simulate`)
      .set(auth)
      .send({ outcome });
  }

  test('TC-PAY-01: successful payment marks the order as paid', async () => {
    const orderId = data.orders['ORD-S05']._id.toString();

    const response = await pay(orderId, 'success');

    expect(response.status).toBe(200);
    expect(response.body.order.status).toBe('Paid');
    expect(response.body.order.payment.status).toBe('Paid');
    expect(response.body.order.payment.transactionRef).toMatch(/^SIM-/);
    expect(response.body.order.statusHistory.at(-1)).toMatchObject({
      status: 'Paid',
      actor: data.users['U-B01']._id.toString(),
    });

    const savedOrder = await Order.findById(orderId);
    expect(savedOrder.status).toBe('Paid');
    expect(savedOrder.payment.status).toBe('Paid');
  });

  test('TC-PAY-02: failed payment cancels the order and releases its stock (REQ-11)', async () => {
    const order = data.orders['ORD-S05'];
    const orderId = order._id.toString();
    const listingId = order.items[0].listing;
    const originalQuantity = (await Listing.findById(listingId)).quantity;

    const response = await pay(orderId, 'failure');

    expect(response.status).toBe(200);
    expect(response.body.order.status).toBe('Cancelled');
    expect(response.body.order.payment.status).toBe('Failed');

    const savedOrder = await Order.findById(orderId);
    expect(savedOrder.status).toBe('Cancelled');
    expect(savedOrder.payment.status).toBe('Failed');

    const listingAfter = await Listing.findById(listingId);
    expect(listingAfter.quantity).toBe(originalQuantity + order.items[0].quantity);
  });

  test('TC-PAY-03: a buyer cannot pay for another buyer order', async () => {
    const orderId = data.orders['ORD-S05']._id.toString();

    const response = await pay(orderId, 'success', secondBuyerAuth);

    expect(response.status).toBe(404);
    expect(response.body.error.message).toMatch(/order not found/i);

    const savedOrder = await Order.findById(orderId);
    expect(savedOrder.status).toBe('Placed');
  });

  test('TC-PAY-04: rejects an invalid order ID', async () => {
    const response = await pay('not-an-object-id', 'success');

    expect(response.status).toBe(400);
  });

  test('TC-PAY-05: rejects an unsupported payment outcome', async () => {
    const orderId = data.orders['ORD-S05']._id.toString();

    const response = await pay(orderId, 'maybe');

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/outcome/i);
  });

  test('TC-PAY-06: rejects payment for an already-paid order', async () => {
    const orderId = data.orders['ORD-S03']._id.toString();

    const response = await pay(orderId, 'success');

    expect(response.status).toBe(409);
    expect(response.body.error.message).toMatch(/already been paid/i);
  });

  test('TC-PAY-07: rejects payment for a cancelled order', async () => {
    const orderId = data.orders['ORD-S04']._id.toString();

    const response = await pay(orderId, 'success');

    expect(response.status).toBe(409);
    expect(response.body.error.message).toMatch(/cancelled order/i);
  });

  test('TC-PAY-08: rejects unauthenticated payment requests', async () => {
    const orderId = data.orders['ORD-S05']._id.toString();

    const response = await request(app)
      .post(`/api/payments/orders/${orderId}/simulate`)
      .send({ outcome: 'success' });

    expect(response.status).toBe(401);
  });
});
