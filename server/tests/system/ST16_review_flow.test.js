const request = require('supertest');
const { testApp } = require('../helpers/app');
const { useTestDatabase } = require('../helpers/db');
const { seedMarketplace } = require('../helpers/fixtures');
const { tokenFor, bearer } = require('../helpers/auth');
const { User, Book, Review } = require('../../src/models');

useTestDatabase();

describe('ST16/ST17 review flow from purchase through moderation', () => {
  let app;
  let data;
  let buyerAuth;
  let sellerAuth;
  let adminAuth;
  let addressId;

  beforeEach(async () => {
    app = testApp();
    data = await seedMarketplace();
    await Review.deleteMany({ book: data.books.B01._id });
    await Book.updateOne(
      { _id: data.books.B01._id },
      { $set: { averageRating: 0, reviewCount: 0 } },
    );

    buyerAuth = bearer(await tokenFor(app, data.users['U-B01']));
    sellerAuth = bearer(await tokenFor(app, data.users['U-S01']));
    adminAuth = bearer(await tokenFor(app, data.users.A01));

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

  test('a buyer can review, edit, and restore a moderated review after delivery', async () => {
    const cart = await request(app)
      .post('/api/cart/items')
      .set(buyerAuth)
      .send({ listingId: data.listings.L01.id, quantity: 1 });
    expect(cart.status).toBe(200);

    const checkout = await request(app)
      .post('/api/checkout/orders')
      .set(buyerAuth)
      .send({ addressId });
    expect(checkout.status).toBe(201);
    const orderId = checkout.body.order.id;
    const reviewPath = `/api/books/${data.books.B01.id}/reviews`;

    const beforeDelivery = await request(app)
      .post(reviewPath)
      .set(buyerAuth)
      .send({ rating: 5, text: 'Not delivered yet.' });
    expect(beforeDelivery.status).toBe(403);

    const paid = await request(app)
      .post(`/api/payments/orders/${orderId}/simulate`)
      .set(buyerAuth)
      .send({ outcome: 'success' });
    expect(paid.status).toBe(200);
    expect(paid.body.order.status).toBe('Paid');

    const shipped = await request(app)
      .patch(`/api/orders/seller/${orderId}/status`)
      .set(sellerAuth)
      .send({ status: 'Shipped' });
    expect(shipped.status).toBe(200);
    expect(shipped.body.order.status).toBe('Shipped');

    const delivered = await request(app)
      .patch(`/api/orders/seller/${orderId}/status`)
      .set(sellerAuth)
      .send({ status: 'Delivered' });
    expect(delivered.status).toBe(200);
    expect(delivered.body.order.status).toBe('Delivered');

    const buyerOrder = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(buyerAuth);
    expect(buyerOrder.status).toBe(200);
    expect(buyerOrder.body.order.status).toBe('Delivered');

    const posted = await request(app)
      .post(reviewPath)
      .set(buyerAuth)
      .send({ rating: 5, text: 'Delivered in excellent condition.' });
    expect(posted.status).toBe(201);
    expect(posted.body.review).toMatchObject({
      rating: 5,
      text: 'Delivered in excellent condition.',
      order: orderId,
    });
    const reviewId = posted.body.review.id;

    const edited = await request(app)
      .put(`${reviewPath}/mine`)
      .set(buyerAuth)
      .send({ rating: 4, text: 'Updated after reading.' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ averageRating: 4, reviewCount: 1 });

    const moderated = await request(app)
      .delete(`/api/admin/reviews/${reviewId}`)
      .set(adminAuth);
    expect(moderated.status).toBe(200);
    expect((await request(app).get(reviewPath)).body).toMatchObject({
      total: 0,
      book: { averageRating: 0, reviewCount: 0 },
    });

    const restored = await request(app)
      .post(`/api/admin/reviews/${reviewId}/restore`)
      .set(adminAuth);
    expect(restored.status).toBe(200);
    expect((await request(app).get(reviewPath)).body).toMatchObject({
      total: 1,
      book: { averageRating: 4, reviewCount: 1 },
    });
  });
});
