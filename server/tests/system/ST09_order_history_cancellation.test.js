const request = require('supertest');
const { testApp } = require('../helpers/app');
const { useTestDatabase } = require('../helpers/db');
const { seedMarketplace } = require('../helpers/fixtures');
const { tokenFor, bearer } = require('../helpers/auth');
const { Order, Listing } = require('../../src/models');

useTestDatabase();

describe('ST09 Buyer Order History and Cancellation', () => {
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

  test('TC-ORD-01: buyer can view their order history', async () => {
    const response = await request(app)
      .get('/api/orders')
      .set(buyerAuth);

    expect(response.status).toBe(200);
    expect(response.body.orders).toBeInstanceOf(Array);
    expect(response.body.orders.length).toBe(3);

    for (const order of response.body.orders) {
      expect(order.buyer.toString()).toBe(data.users['U-B01']._id.toString());
    }
  });

  test('TC-ORD-02: buyer can view their own order details', async () => {
    const orderId = data.orders['ORD-S05']._id.toString();

    const response = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(buyerAuth);

    expect(response.status).toBe(200);
    expect(response.body.order.id).toBe(orderId);
    expect(response.body.order.status).toBe('Placed');
  });

  test('TC-ORD-03: buyer cannot view another buyer order', async () => {
    const orderId = data.orders['ORD-S05']._id.toString();

    const response = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(secondBuyerAuth);

    expect(response.status).toBe(404);
  });

  test('TC-ORD-04: buyer can cancel an unpaid placed order', async () => {
    const orderId = data.orders['ORD-S05']._id.toString();

    const response = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set(buyerAuth);

    expect(response.status).toBe(200);
    expect(response.body.order.status).toBe('Cancelled');

    const savedOrder = await Order.findById(orderId);
    expect(savedOrder.status).toBe('Cancelled');
  });

  test('TC-ORD-05: cancellation restores listing stock', async () => {
    const order = data.orders['ORD-S05'];
    const listingId = order.items[0].listing;
    const orderedQuantity = order.items[0].quantity;

    const listingBefore = await Listing.findById(listingId);
    const originalQuantity = listingBefore.quantity;

    const response = await request(app)
      .post(`/api/orders/${order._id}/cancel`)
      .set(buyerAuth);

    expect(response.status).toBe(200);

    const listingAfter = await Listing.findById(listingId);
    expect(listingAfter.quantity).toBe(originalQuantity + orderedQuantity);
  });

  test('TC-ORD-06: buyer cannot cancel a paid order', async () => {
    const orderId = data.orders['ORD-S03']._id.toString();

    const response = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set(buyerAuth);

    expect(response.status).toBe(409);

    const savedOrder = await Order.findById(orderId);
    expect(savedOrder.status).toBe('Paid');
  });

  test('TC-ORD-07: buyer cannot cancel an already cancelled order', async () => {
    const orderId = data.orders['ORD-S04']._id.toString();

    const response = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set(buyerAuth);

    expect(response.status).toBe(409);
  });

  test('TC-ORD-08: buyer cannot cancel another buyer order', async () => {
    const orderId = data.orders['ORD-S05']._id.toString();

    const response = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set(secondBuyerAuth);

    expect(response.status).toBe(404);

    const savedOrder = await Order.findById(orderId);
    expect(savedOrder.status).toBe('Placed');
  });

  test('TC-ORD-09: invalid order ID is rejected', async () => {
    const response = await request(app)
      .get('/api/orders/not-an-object-id')
      .set(buyerAuth);

    expect(response.status).toBe(400);
  });

  test('TC-ORD-10: unauthenticated buyer cannot view orders', async () => {
    const response = await request(app).get('/api/orders');

    expect(response.status).toBe(401);
  });

  test('TC-ORD-11: failed cancellation does not change listing stock', async () => {
    const order = data.orders['ORD-S03'];
    const listingId = order.items[0].listing;

    const listingBefore = await Listing.findById(listingId);
    const originalQuantity = listingBefore.quantity;

    const response = await request(app)
      .post(`/api/orders/${order._id}/cancel`)
      .set(buyerAuth);

    expect(response.status).toBe(409);

    const listingAfter = await Listing.findById(listingId);
    expect(listingAfter.quantity).toBe(originalQuantity);
  });
});