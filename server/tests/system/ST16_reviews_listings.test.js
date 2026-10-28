const request = require('supertest');
const { testApp } = require('../helpers/app');
const { useTestDatabase } = require('../helpers/db');
const { seedMarketplace } = require('../helpers/fixtures');
const { tokenFor, bearer } = require('../helpers/auth');
const { Order, Review, Book, Listing } = require('../../src/models');

useTestDatabase();

describe('ST16-19 reviews, ratings and seller listings', () => {
  let app;
  let data;
  let buyerAuth;
  let sellerAuth;
  let otherSellerAuth;
  let adminAuth;

  beforeEach(async () => {
    app = testApp();
    data = await seedMarketplace();

    // Keep these tests independent of the fixture's existing B01 review.
    await Review.deleteMany({ book: data.books.B01._id });
    await Book.updateOne(
      { _id: data.books.B01._id },
      { $set: { averageRating: 0, reviewCount: 0 } }
    );

    buyerAuth = bearer(await tokenFor(app, data.users['U-B01']));
    sellerAuth = bearer(await tokenFor(app, data.users['U-S01']));
    otherSellerAuth = bearer(await tokenFor(app, data.users['U-S02']));
    adminAuth = bearer(await tokenFor(app, data.users.A01));
  });

  async function deliveredOrder(
    buyer = data.users['U-B01'],
    book = data.books.B01,
    listing = data.listings.L01
  ) {
    return Order.create({
      buyer: buyer._id,
      items: [
        {
          listing: listing._id,
          book: book._id,
          seller: listing.seller,
          quantity: 1,
          unitPrice: listing.price,
        },
      ],
      totalAmount: listing.price,
      status: 'Delivered',
    });
  }

  test('ST16: only a buyer with a delivered order can post once; aggregate and public review list update', async () => {
    const path = `/api/books/${data.books.B01.id}/reviews`;

    const beforeDelivery = await request(app)
      .post(path)
      .set(buyerAuth)
      .send({ rating: 5 });

    expect(beforeDelivery.status).toBe(403);

    await deliveredOrder();

    const posted = await request(app)
      .post(path)
      .set(buyerAuth)
      .send({ rating: 5, text: 'Excellent copy.' });

    expect(posted.status).toBe(201);

    const duplicate = await request(app)
      .post(path)
      .set(buyerAuth)
      .send({ rating: 4 });

    expect(duplicate.status).toBe(409);

    const book = await Book.findById(data.books.B01.id);

    expect(book.toObject()).toMatchObject({
      averageRating: 5,
      reviewCount: 1,
    });

    const listed = await request(app).get(path);

    expect(listed.status).toBe(200);
    expect(listed.body.reviews[0].text).toBe('Excellent copy.');
    expect(listed.body.book).toMatchObject({
      averageRating: 5,
      reviewCount: 1,
    });
  });

  test('ST17: review validation, 30-day edit window and administrator moderation maintain aggregates', async () => {
    await deliveredOrder();

    const path = `/api/books/${data.books.B01.id}/reviews`;

    const invalid = await request(app)
      .post(path)
      .set(buyerAuth)
      .send({ rating: 6 });

    expect(invalid.status).toBe(400);

    const posted = await request(app)
      .post(path)
      .set(buyerAuth)
      .send({ rating: 2 });

    expect(posted.status).toBe(201);

    const edit = await request(app)
      .put(`${path}/mine`)
      .set(buyerAuth)
      .send({ rating: 4, text: 'Updated' });

    expect(edit.status).toBe(200);
    expect(edit.body).toMatchObject({
      averageRating: 4,
      reviewCount: 1,
    });

    const review = await Review.findOne({
      user: data.users['U-B01']._id,
      book: data.books.B01._id,
    });

    expect(review).not.toBeNull();

    // timestamps make createdAt immutable through save(), so back-date it directly.
    await Review.collection.updateOne(
      { _id: review._id },
      { $set: { createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) } }
    );

    const expiredEdit = await request(app)
      .put(`${path}/mine`)
      .set(buyerAuth)
      .send({ rating: 1 });

    expect(expiredEdit.status).toBe(409);

    const removed = await request(app)
      .delete(`/api/admin/reviews/${review.id}`)
      .set(adminAuth);

    expect(removed.status).toBe(200);

    const bookAfterRemoval = await Book.findById(data.books.B01.id);
    expect(bookAfterRemoval.reviewCount).toBe(0);

    const restored = await request(app)
      .post(`/api/admin/reviews/${review.id}/restore`)
      .set(adminAuth);

    expect(restored.status).toBe(200);

    // The restored review keeps its last accepted rating (the in-window edit to 4).
    const bookAfterRestore = await Book.findById(data.books.B01.id);
    expect(bookAfterRestore.averageRating).toBe(4);
    expect(bookAfterRestore.reviewCount).toBe(1);
  });

  test('BR-6: a seller cannot review a book they actively list', async () => {
    await deliveredOrder(
      data.users['U-S01'],
      data.books.B01,
      data.listings.L01
    );

    const response = await request(app)
      .post(`/api/books/${data.books.B01.id}/reviews`)
      .set(sellerAuth)
      .send({ rating: 4 });

    expect(response.status).toBe(403);
  });

  test('ST18: seller can create a listing for a catalog ISBN and manage only their listings', async () => {
    const path = '/api/listings';

    const buyerAttempt = await request(app)
      .post(path)
      .set(buyerAuth)
      .send({
        isbn: data.books.B02.isbn,
        price: 300,
        quantity: 1,
        condition: 'Good',
      });

    expect(buyerAttempt.status).toBe(403);

    const created = await request(app)
      .post(path)
      .set(sellerAuth)
      .send({
        isbn: data.books.B02.isbn,
        price: 300.5,
        quantity: 2,
        condition: 'Like New',
        notes: 'Clean pages',
      });

    expect(created.status).toBe(201);

    const listingId = created.body.listing.id;

    expect(created.body.listing).toMatchObject({
      price: 300.5,
      quantity: 2,
      condition: 'Like New',
    });

    const edited = await request(app)
      .patch(`${path}/${listingId}`)
      .set(sellerAuth)
      .send({ quantity: 0, price: 299 });

    expect(edited.status).toBe(200);

    const otherSellerEdit = await request(app)
      .patch(`${path}/${listingId}`)
      .set(otherSellerAuth)
      .send({ price: 100 });

    expect(otherSellerEdit.status).toBe(404);

    const publicResponse = await request(app)
      .get(`/api/books/${data.books.B02.id}/listings`);

    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body.listings.map((item) => item.id))
      .not.toContain(listingId);
  });

  test('ST19: open orders block removal; own listing can be removed after the order closes', async () => {
    const created = await request(app)
      .post('/api/listings')
      .set(sellerAuth)
      .send({
        isbn: data.books.B07.isbn,
        price: 150,
        quantity: 1,
        condition: 'Good',
      });

    expect(created.status).toBe(201);

    const listing = created.body.listing;

    await Order.create({
      buyer: data.users['U-B01']._id,
      items: [
        {
          listing: listing.id,
          book: data.books.B07.id,
          seller: data.users['U-S01']._id,
          quantity: 1,
          unitPrice: 150,
        },
      ],
      totalAmount: 150,
      status: 'Placed',
    });

    const blockedRemoval = await request(app)
      .delete(`/api/listings/${listing.id}`)
      .set(sellerAuth);

    expect(blockedRemoval.status).toBe(409);

    await Order.updateOne(
      { 'items.listing': listing.id },
      { $set: { status: 'Cancelled' } }
    );

    const removal = await request(app)
      .delete(`/api/listings/${listing.id}`)
      .set(sellerAuth);

    expect(removal.status).toBe(200);

    expect(
      await Listing.findOne({
        _id: listing.id,
        deletedAt: null,
      })
    ).toBeNull();
  });
});
