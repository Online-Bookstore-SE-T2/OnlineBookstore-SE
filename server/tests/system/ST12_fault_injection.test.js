const request = require('supertest');
const { testApp } = require('../helpers/app');
const { useTestDatabase } = require('../helpers/db');
const { seedMarketplace } = require('../helpers/fixtures');
const { tokenFor, bearer } = require('../helpers/auth');
const { User, Cart, Listing, Order } = require('../../src/models');

useTestDatabase();

// REQ-12 / NFR04: a failure at any step of order processing leaves the database consistent.
// Each test forces a database error at one step (fault injection with jest spies) and then
// checks orders, payment records, stock and the cart.
describe('ST12 Fault injection during order processing', () => {
  let app;
  let data;
  let buyerAuth;
  let addressId;
  let ordersBefore;
  const injected = () => new Error('Injected database failure');

  beforeEach(async () => {
    app = testApp();
    data = await seedMarketplace();
    buyerAuth = bearer(await tokenFor(app, data.users['U-B01']));
    const buyer = await User.findById(data.users['U-B01']._id);
    buyer.addresses.push({ line: 'Flat 12, Lakeview Apartments', city: 'Bengaluru', state: 'Karnataka', postalCode: '560011' });
    await buyer.save();
    addressId = buyer.addresses[0]._id.toString();
    // The fixture already holds three orders for U-B01; only orders created by the test count.
    ordersBefore = await Order.countDocuments({ buyer: data.users['U-B01']._id });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const fillCart = (items) => Cart.create({ buyer: data.users['U-B01']._id, items });
  const placeOrder = () => request(app).post('/api/checkout/orders').set(buyerAuth).send({ addressId });
  const stock = async (key) => (await Listing.findById(data.listings[key]._id)).quantity;
  const newOrders = async () => (await Order.countDocuments({ buyer: data.users['U-B01']._id })) - ordersBefore;
  const cartSize = async () => (await Cart.findOne({ buyer: data.users['U-B01']._id })).items.length;

  // Fails the n-th stock decrement (1-based); earlier calls run normally.
  function failStockDecrementOnCall(n) {
    const original = Listing.findOneAndUpdate.bind(Listing);
    let calls = 0;
    return jest.spyOn(Listing, 'findOneAndUpdate').mockImplementation((...args) => {
      calls += 1;
      return calls === n ? Promise.reject(injected()) : original(...args);
    });
  }

  async function expectNothingChanged() {
    expect(await newOrders()).toBe(0);
    expect(await stock('L01')).toBe(5);
    expect(await stock('L04')).toBe(10);
    expect(await cartSize()).toBe(2);
  }

  test('TC-ST12-03: a failure while decrementing stock stores no order and leaves stock unchanged', async () => {
    await fillCart([
      { listing: data.listings.L01._id, quantity: 1 },
      { listing: data.listings.L04._id, quantity: 1 },
    ]);
    // The first item's stock is decremented, then the second decrement fails: the first must roll back.
    const spy = failStockDecrementOnCall(2);

    const response = await placeOrder();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.body.error?.message).toBeTruthy();
    expect(JSON.stringify(response.body)).not.toContain('Injected database failure');
    await expectNothingChanged();
  });

  test('TC-ST12-04: a failure while creating the order record stores no order or payment and leaves stock unchanged', async () => {
    await fillCart([
      { listing: data.listings.L01._id, quantity: 1 },
      { listing: data.listings.L04._id, quantity: 1 },
    ]);
    const spy = jest.spyOn(Order, 'create').mockRejectedValueOnce(injected());

    const response = await placeOrder();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(response.status).toBeGreaterThanOrEqual(500);
    await expectNothingChanged();
    // Payment details live on the order document, so no new order also means no payment record.
  });

  test('TC-NFR-SAF-01: failures at the stock, order-write and payment-recording steps each leave the database consistent', async () => {
    const items = [
      { listing: data.listings.L01._id, quantity: 2 },
      { listing: data.listings.L04._id, quantity: 1 },
    ];

    // Step 1: stock decrement.
    await fillCart(items);
    failStockDecrementOnCall(2);
    expect((await placeOrder()).status).toBeGreaterThanOrEqual(500);
    expect(await newOrders()).toBe(0);
    expect([await stock('L01'), await stock('L04')]).toEqual([5, 10]);
    jest.restoreAllMocks();

    // Step 2: order write.
    jest.spyOn(Order, 'create').mockRejectedValueOnce(injected());
    expect((await placeOrder()).status).toBeGreaterThanOrEqual(500);
    expect(await newOrders()).toBe(0);
    expect([await stock('L01'), await stock('L04')]).toEqual([5, 10]);
    jest.restoreAllMocks();

    // Without a fault the same checkout succeeds: stock is reserved for exactly this order.
    const placed = await placeOrder();
    expect(placed.status).toBe(201);
    const orderId = placed.body.order.id;
    expect([await stock('L01'), await stock('L04')]).toEqual([3, 9]);

    // Step 3: payment recording (successful payment, but saving it fails).
    jest.spyOn(Order.prototype, 'save').mockRejectedValueOnce(injected());
    const failedSave = await request(app).post(`/api/payments/orders/${orderId}/simulate`).set(buyerAuth).send({ outcome: 'success' });
    expect(failedSave.status).toBeGreaterThanOrEqual(500);
    let order = await Order.findById(orderId);
    expect(order.status).toBe('Placed');
    expect(order.payment.status).toBe('Pending');
    expect(order.payment.transactionRef).toBeUndefined();
    expect([await stock('L01'), await stock('L04')]).toEqual([3, 9]);
    jest.restoreAllMocks();

    // A failed payment whose recording fails must not release the stock either (no unmatched change).
    jest.spyOn(Order.prototype, 'save').mockRejectedValueOnce(injected());
    const failedRelease = await request(app).post(`/api/payments/orders/${orderId}/simulate`).set(buyerAuth).send({ outcome: 'failure' });
    expect(failedRelease.status).toBeGreaterThanOrEqual(500);
    order = await Order.findById(orderId);
    expect(order.status).toBe('Placed');
    expect([await stock('L01'), await stock('L04')]).toEqual([3, 9]);
    jest.restoreAllMocks();

    // Retrying once the fault clears records the payment normally.
    const retry = await request(app).post(`/api/payments/orders/${orderId}/simulate`).set(buyerAuth).send({ outcome: 'success' });
    expect(retry.status).toBe(200);
    order = await Order.findById(orderId);
    expect(order.status).toBe('Paid');
    expect(order.payment.status).toBe('Paid');
    expect(await newOrders()).toBe(1);
    expect([await stock('L01'), await stock('L04')]).toEqual([3, 9]);
  });
});
