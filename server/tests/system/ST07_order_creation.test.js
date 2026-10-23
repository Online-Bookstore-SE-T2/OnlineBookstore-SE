const request = require('supertest');
const { testApp } = require('../helpers/app');
const { useTestDatabase } = require('../helpers/db');
const { seedMarketplace } = require('../helpers/fixtures');
const { tokenFor, bearer } = require('../helpers/auth');
const { User, Cart, Listing, Order } = require('../../src/models');

useTestDatabase();

describe('ST07 Order Creation', () => {
  let app;
  let data;
  let buyerAuth;
  let sellerAuth;
  let addressId;

  beforeEach(async () => {
    app = testApp();
    data = await seedMarketplace();

    buyerAuth = bearer(await tokenFor(app, data.users['U-B01']));
    sellerAuth = bearer(await tokenFor(app, data.users['U-S01']));

    const buyer = await User.findById(data.users['U-B01']._id);

    buyer.addresses.push({
      line: 'Flat 12, Lakeview Apartments',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560011',
    });

    await buyer.save();
    addressId = buyer.addresses[0]._id.toString();
  });

  async function addCartItems(items) {
    return Cart.create({
      buyer: data.users['U-B01']._id,
      items: items.map(({ listing, quantity }) => ({
        listing,
        quantity,
      })),
    });
  }

  async function placeOrder(auth = buyerAuth, address = addressId) {
    return request(app)
      .post('/api/checkout/orders')
      .set(auth)
      .send({ addressId: address });
  }

  test('TC-ORDER-01: creates an order with the correct total', async () => {
    await addCartItems([
      { listing: data.listings.L01._id, quantity: 2 },
    ]);
    const response = await placeOrder();

    expect(response.status).toBe(201);
    expect(response.body.order).toBeDefined();
    expect(response.body.order.totalAmount).toBe(698);
    expect(response.body.order.items).toHaveLength(1);
    expect(response.body.order.items[0].quantity).toBe(2);
    expect(response.body.order.items[0].unitPrice).toBe(349);
  });

  test('TC-ORDER-02: decrements listing stock after successful order creation', async () => {
    await addCartItems([
      { listing: data.listings.L01._id, quantity: 2 },
    ]);

    const stockBefore = (
      await Listing.findById(data.listings.L01._id)
    ).quantity;

    const response = await placeOrder();

    const stockAfter = (
      await Listing.findById(data.listings.L01._id)
    ).quantity;

    expect(response.status).toBe(201);
    expect(stockAfter).toBe(stockBefore - 2);
  });

  test('TC-ORDER-03: clears the cart after successful order creation', async () => {
    await addCartItems([
      { listing: data.listings.L01._id, quantity: 1 },
    ]);

    const response = await placeOrder();

    const cart = await Cart.findOne({
      buyer: data.users['U-B01']._id,
    });

    expect(response.status).toBe(201);
    expect(cart.items).toHaveLength(0);
  });

  test('TC-ORDER-04: rejects an empty cart', async () => {
    const response = await placeOrder();

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/cart is empty/i);
  });

  test('TC-ORDER-05: rejects insufficient stock without creating an order', async () => {
    const listing = data.listings.L01;

    await addCartItems([
      { listing: listing._id, quantity: listing.quantity + 1 },
    ]);

    const stockBefore = (
      await Listing.findById(listing._id)
    ).quantity;

    const orderCountBefore = await Order.countDocuments({});

    const response = await placeOrder();

    const stockAfter = (
      await Listing.findById(listing._id)
    ).quantity;

    const orderCountAfter = await Order.countDocuments({});

    expect(response.status).toBe(409);
    expect(stockAfter).toBe(stockBefore);
    expect(orderCountAfter).toBe(orderCountBefore);
  });

  test('TC-ORDER-06: rolls back earlier stock changes if a later item fails', async () => {
    await addCartItems([
      { listing: data.listings.L01._id, quantity: 2 },
      { listing: data.listings.L06._id, quantity: 3 },
    ]);

    const firstStockBefore = (
      await Listing.findById(data.listings.L01._id)
    ).quantity;

    const secondStockBefore = (
      await Listing.findById(data.listings.L06._id)
    ).quantity;

    const orderCountBefore = await Order.countDocuments({});

    const response = await placeOrder();

    const firstStockAfter = (
      await Listing.findById(data.listings.L01._id)
    ).quantity;

    const secondStockAfter = (
      await Listing.findById(data.listings.L06._id)
    ).quantity;

    const cart = await Cart.findOne({
      buyer: data.users['U-B01']._id,
    });

    expect(response.status).toBe(409);
    expect(firstStockAfter).toBe(firstStockBefore);
    expect(secondStockAfter).toBe(secondStockBefore);
    expect(await Order.countDocuments({})).toBe(orderCountBefore);
    expect(cart.items).toHaveLength(2);
  });

  test('TC-ORDER-07: rejects unauthenticated order creation', async () => {
    await addCartItems([
      { listing: data.listings.L01._id, quantity: 1 },
    ]);

    const response = await request(app)
      .post('/api/checkout/orders')
      .send({ addressId });

    expect(response.status).toBe(401);
  });

  test('TC-ORDER-08: prevents sellers from creating buyer orders', async () => {
    const response = await placeOrder(sellerAuth);

    expect(response.status).toBe(403);
  });

  test('TC-ORDER-09: rejects an invalid delivery address', async () => {
    await addCartItems([
      { listing: data.listings.L01._id, quantity: 1 },
    ]);

    const response = await placeOrder(
      buyerAuth,
      'not-an-object-id',
    );

    expect(response.status).toBe(400);
  });
});
