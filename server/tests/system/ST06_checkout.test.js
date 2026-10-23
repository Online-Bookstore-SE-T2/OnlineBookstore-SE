const request = require('supertest');
const { testApp } = require('../helpers/app');
const { useTestDatabase } = require('../helpers/db');
const { seedMarketplace } = require('../helpers/fixtures');
const { tokenFor, bearer } = require('../helpers/auth');
const { User, Cart, Listing, Order } = require('../../src/models');

useTestDatabase();

describe('ST06 Checkout Validation', () => {
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

  async function addCartItem(listingId, quantity) {
    return Cart.create({
      buyer: data.users['U-B01']._id,
      items: [{ listing: listingId, quantity }],
    });
  }

  test('TC-CHECKOUT-01: validates a cart and calculates the total from current listing prices', async () => {
    await addCartItem(data.listings.L01._id, 2);

    const res = await request(app)
      .post('/api/checkout/validate')
      .set(buyerAuth)
      .send({ addressId, totalAmount: 1 });

    expect(res.status).toBe(200);
    expect(res.body.checkout.items).toHaveLength(1);
    expect(res.body.checkout.items[0].quantity).toBe(2);
    expect(res.body.checkout.items[0].unitPrice).toBe(349);
    expect(res.body.checkout.subtotal).toBe(698);
    expect(res.body.checkout.totalAmount).toBe(698);
    expect(res.body.checkout.currency).toBe('INR');
  });

  test('TC-CHECKOUT-02: rejects an empty cart', async () => {
    const res = await request(app)
      .post('/api/checkout/validate')
      .set(buyerAuth)
      .send({ addressId });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/cart is empty/i);
  });

  test('TC-CHECKOUT-03: rejects an invalid address ID', async () => {
    await addCartItem(data.listings.L01._id, 1);

    const res = await request(app)
      .post('/api/checkout/validate')
      .set(buyerAuth)
      .send({ addressId: 'not-an-object-id' });

    expect(res.status).toBe(400);
  });

  test('TC-CHECKOUT-04: rejects a listing with insufficient stock', async () => {
    const listing = data.listings.L01;
    await addCartItem(listing._id, listing.quantity + 1);

    const res = await request(app)
      .post('/api/checkout/validate')
      .set(buyerAuth)
      .send({ addressId });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/available/i);
  });

  test('TC-CHECKOUT-05: rejects requests without authentication', async () => {
    const res = await request(app)
      .post('/api/checkout/validate')
      .send({ addressId });

    expect(res.status).toBe(401);
  });

  test('TC-CHECKOUT-06: prevents sellers from checking out as buyers', async () => {
    const res = await request(app)
      .post('/api/checkout/validate')
      .set(sellerAuth)
      .send({ addressId });

    expect(res.status).toBe(403);
  });

  test('TC-CHECKOUT-07: validation does not change stock or create an order', async () => {
    await addCartItem(data.listings.L01._id, 2);

    const listingBefore = await Listing.findById(data.listings.L01._id);
    const orderCountBefore = await Order.countDocuments({});

    const res = await request(app)
      .post('/api/checkout/validate')
      .set(buyerAuth)
      .send({ addressId });

    const listingAfter = await Listing.findById(data.listings.L01._id);
    const orderCountAfter = await Order.countDocuments({});

    expect(res.status).toBe(200);
    expect(listingAfter.quantity).toBe(listingBefore.quantity);
    expect(orderCountAfter).toBe(orderCountBefore);
  });
});
