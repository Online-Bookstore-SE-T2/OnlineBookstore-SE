const request = require('supertest');
const { testApp } = require('../helpers/app');
const { useTestDatabase } = require('../helpers/db');
const { seedMarketplace } = require('../helpers/fixtures');
const { tokenFor, bearer } = require('../helpers/auth');
const { config } = require('../../src/config/env');
const { deliverDueDemoOrders } = require('../../src/services/orderService');
const { User, Order, Notification } = require('../../src/models');

useTestDatabase();

// Hosted-demo auto-delivery (DEMO_AUTO_DELIVER_SECONDS), a recorded deviation from the SRS.
describe('ST16 demo auto-delivery of paid orders', () => {
  let app;
  let data;
  let buyerAuth;
  let addressId;
  let savedSetting;

  beforeEach(async () => {
    savedSetting = config.demoAutoDeliverSeconds;
    config.demoAutoDeliverSeconds = '10';
    app = testApp();
    data = await seedMarketplace();
    buyerAuth = bearer(await tokenFor(app, data.users['U-B01']));

    const buyer = await User.findById(data.users['U-B01']._id);
    buyer.addresses.push({ line: 'Flat 12, Lakeview Apartments', city: 'Bengaluru', state: 'Karnataka', postalCode: '560011' });
    await buyer.save();
    addressId = buyer.addresses[0]._id.toString();
  });

  afterEach(() => {
    config.demoAutoDeliverSeconds = savedSetting;
  });

  async function paidOrder() {
    await request(app).post('/api/cart/items').set(buyerAuth).send({ listingId: data.listings.L01.id, quantity: 1 });
    const checkout = await request(app).post('/api/checkout/orders').set(buyerAuth).send({ addressId });
    expect(checkout.status).toBe(201);
    const orderId = checkout.body.order.id;
    const paid = await request(app).post(`/api/payments/orders/${orderId}/simulate`).set(buyerAuth).send({ outcome: 'success' });
    expect(paid.body.order.status).toBe('Paid');
    return orderId;
  }

  function secondsFromNow(seconds) {
    return new Date(Date.now() + seconds * 1000);
  }

  test('a paid order is delivered 10 seconds after payment and the buyer can then review it', async () => {
    const orderId = await paidOrder();

    const before = await request(app).get(`/api/orders/${orderId}`).set(buyerAuth);
    expect(before.body.order.status).toBe('Paid');
    const dueAt = new Date(before.body.order.autoDeliverAt).getTime();
    expect(dueAt - Date.now()).toBeGreaterThan(5000);
    expect(dueAt - Date.now()).toBeLessThanOrEqual(10000);

    expect(await deliverDueDemoOrders(secondsFromNow(5))).toHaveLength(0);
    expect((await Order.findById(orderId)).status).toBe('Paid');

    expect(await deliverDueDemoOrders(secondsFromNow(11))).toHaveLength(1);
    const after = await request(app).get(`/api/orders/${orderId}`).set(buyerAuth);
    expect(after.body.order.status).toBe('Delivered');
    expect(after.body.order.autoDeliverAt).toBeUndefined();
    expect(after.body.order.statusHistory.map((entry) => entry.status)).toEqual(['Placed', 'Paid', 'Shipped', 'Delivered']);
    expect(after.body.order.statusHistory[3].actor.id).toBe(data.users['U-S01'].id);
    expect(await Notification.exists({ recipient: data.users['U-B01']._id, relatedOrder: orderId, message: /from Paid to Delivered/ })).toBeTruthy();

    // A second sweep leaves the delivered order alone.
    expect(await deliverDueDemoOrders(secondsFromNow(20))).toHaveLength(0);

    const review = await request(app)
      .post(`/api/books/${data.books.B01.id}/reviews`)
      .set(buyerAuth)
      .send({ rating: 5, text: 'Arrived in the demo.' });
    expect(review.status).toBe(201);
  });

  test('an order cancelled before the delay ends is not delivered', async () => {
    const orderId = await paidOrder();
    const cancelled = await request(app).post(`/api/orders/${orderId}/cancel`).set(buyerAuth);
    expect(cancelled.status).toBe(200);

    expect(await deliverDueDemoOrders(secondsFromNow(11))).toHaveLength(0);
    expect((await Order.findById(orderId)).status).toBe('Cancelled');
  });

  test('nothing is delivered automatically when the setting is off', async () => {
    const orderId = await paidOrder();
    config.demoAutoDeliverSeconds = undefined;

    const order = await request(app).get(`/api/orders/${orderId}`).set(buyerAuth);
    expect(order.body.order.autoDeliverAt).toBeUndefined();
    expect(await deliverDueDemoOrders(secondsFromNow(3600))).toHaveLength(0);
    expect((await Order.findById(orderId)).status).toBe('Paid');
  });
});
