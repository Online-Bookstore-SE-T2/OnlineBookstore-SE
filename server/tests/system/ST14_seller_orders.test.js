const request = require('supertest');
const { testApp } = require('../helpers/app');
const { useTestDatabase } = require('../helpers/db');
const { seedMarketplace } = require('../helpers/fixtures');
const { tokenFor, bearer } = require('../helpers/auth');
const { Order } = require('../../src/models');

useTestDatabase();

describe('ST14 seller orders dashboard', () => {
  let app;
  let data;
  let sellerAuth;
  let otherSellerAuth;
  let buyerAuth;

  beforeEach(async () => {
    app = testApp();
    data = await seedMarketplace();
    sellerAuth = bearer(await tokenFor(app, data.users['U-S01']));
    otherSellerAuth = bearer(await tokenFor(app, data.users['U-S02']));
    buyerAuth = bearer(await tokenFor(app, data.users['U-B01']));
  });

  async function createMultiSellerOrder() {
    return Order.create({
      buyer: data.users['U-B01']._id,
      items: [
        {
          listing: data.listings.L04._id,
          book: data.books.B02._id,
          seller: data.users['U-S01']._id,
          title: data.books.B02.title,
          quantity: 2,
          unitPrice: 550,
        },
        {
          listing: data.listings.L08._id,
          book: data.books.B07._id,
          seller: data.users['U-S02']._id,
          title: data.books.B07.title,
          quantity: 1,
          unitPrice: 150,
        },
      ],
      deliveryAddress: {
        line: 'Flat 12, Lakeview Apartments',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560011',
      },
      totalAmount: 1250,
      status: 'Paid',
      payment: { provider: 'test', transactionRef: 'private-payment-reference', status: 'Paid' },
    });
  }

  test('returns only the seller’s order lines, delivery details, and no buyer email or payment data', async () => {
    const order = await createMultiSellerOrder();

    const response = await request(app)
      .get('/api/orders/seller')
      .set(sellerAuth);

    expect(response.status).toBe(200);
    const sellerOrder = response.body.orders.find((item) => item.id === order.id);
    expect(sellerOrder).toBeDefined();
    expect(sellerOrder).toMatchObject({
      id: order.id,
      status: 'Paid',
      buyer: { name: data.users['U-B01'].name },
      deliveryAddress: {
        line: 'Flat 12, Lakeview Apartments',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560011',
      },
      totalAmount: 1100,
    });
    expect(sellerOrder.items).toHaveLength(1);
    expect(sellerOrder.items[0]).toMatchObject({
      title: data.books.B02.title,
      quantity: 2,
      unitPrice: 550,
    });
    expect(JSON.stringify(sellerOrder)).not.toContain(data.users['U-B01'].email);
    expect(JSON.stringify(sellerOrder)).not.toContain('private-payment-reference');
    expect(JSON.stringify(sellerOrder)).not.toContain(data.books.B07.title);
  });

  test('seller access is role and order-line scoped', async () => {
    const order = await createMultiSellerOrder();

    const buyerResponse = await request(app)
      .get('/api/orders/seller')
      .set(buyerAuth);
    expect(buyerResponse.status).toBe(403);

    const otherSellerResponse = await request(app)
      .get('/api/orders/seller')
      .set(otherSellerAuth);
    expect(otherSellerResponse.status).toBe(200);
    expect(otherSellerResponse.body.orders).toHaveLength(1);
    expect(otherSellerResponse.body.orders[0].id).toBe(order.id);
    expect(otherSellerResponse.body.orders[0].items.map((item) => item.title))
      .toEqual([data.books.B07.title]);
  });

  test('seller status actions follow the shared order transition table', async () => {
    const order = await createMultiSellerOrder();
    const path = `/api/orders/seller/${order.id}/status`;

    const shipped = await request(app)
      .patch(path)
      .set(sellerAuth)
      .send({ status: 'Shipped' });
    expect(shipped.status).toBe(200);
    expect(shipped.body.order.status).toBe('Shipped');

    const delivered = await request(app)
      .patch(path)
      .set(sellerAuth)
      .send({ status: 'Delivered' });
    expect(delivered.status).toBe(200);
    expect(delivered.body.order.status).toBe('Delivered');
    expect(delivered.body.order.statusHistory.at(-1)).toMatchObject({
      status: 'Delivered',
      actor: data.users['U-S01']._id.toString(),
    });

    const invalidTransition = await request(app)
      .patch(path)
      .set(sellerAuth)
      .send({ status: 'Shipped' });
    expect(invalidTransition.status).toBe(409);
  });
});
