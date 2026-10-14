const request = require('supertest');
const { testApp } = require('../helpers/app');
const { useTestDatabase } = require('../helpers/db');
const { seedMarketplace } = require('../helpers/fixtures');
const { tokenFor, bearer } = require('../helpers/auth');
const { Order, Review, Book, Listing } = require('../../src/models');

useTestDatabase();

describe('ST16-19 reviews, ratings and seller listings', () => {
  let app; let data; let buyerAuth; let sellerAuth; let otherSellerAuth; let adminAuth;
  beforeEach(async () => {
    app = testApp();
    data = await seedMarketplace();
    buyerAuth = bearer(await tokenFor(app, data.users['U-B01']));
    sellerAuth = bearer(await tokenFor(app, data.users['U-S01']));
    otherSellerAuth = bearer(await tokenFor(app, data.users['U-S02']));
    adminAuth = bearer(await tokenFor(app, data.users.A01));
  });

  async function deliveredOrder(buyer = data.users['U-B01'], book = data.books.B01, listing = data.listings.L01) {
    return Order.create({ buyer: buyer._id, items: [{ listing: listing._id, book: book._id, seller: listing.seller, quantity: 1, unitPrice: listing.price }], totalAmount: listing.price, status: 'Delivered' });
  }

  test('ST16: only a buyer with a delivered order can post once; aggregate and public review list update', async () => {
    const path = `/api/books/${data.books.B01.id}/reviews`;
    expect((await request(app).post(path).set(buyerAuth).send({ rating: 5 })).status).toBe(403);
    await deliveredOrder();
    const posted = await request(app).post(path).set(buyerAuth).send({ rating: 5, text: 'Excellent copy.' });
    expect(posted.status).toBe(201);
    expect((await request(app).post(path).set(buyerAuth).send({ rating: 4 })).status).toBe(409);
    const book = await Book.findById(data.books.B01.id);
    expect(book).toMatchObject({ averageRating: 5, reviewCount: 1 });
    const listed = await request(app).get(path);
    expect(listed.status).toBe(200);
    expect(listed.body.reviews[0].text).toBe('Excellent copy.');
    expect(listed.body.book).toMatchObject({ averageRating: 5, reviewCount: 1 });
  });

  test('ST17: review validation, 30-day edit window and administrator moderation maintain aggregates', async () => {
    await deliveredOrder();
    const path = `/api/books/${data.books.B01.id}/reviews`;
    expect((await request(app).post(path).set(buyerAuth).send({ rating: 6 })).status).toBe(400);
    await request(app).post(path).set(buyerAuth).send({ rating: 2 });
    const edit = await request(app).put(`${path}/mine`).set(buyerAuth).send({ rating: 4, text: 'Updated' });
    expect(edit.status).toBe(200);
    expect(edit.body).toMatchObject({ averageRating: 4, reviewCount: 1 });
    const review = await Review.findOne({ user: data.users['U-B01']._id, book: data.books.B01._id });
    review.createdAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await review.save();
    expect((await request(app).put(`${path}/mine`).set(buyerAuth).send({ rating: 1 })).status).toBe(409);
    const removed = await request(app).delete(`/api/admin/reviews/${review.id}`).set(adminAuth);
    expect(removed.status).toBe(200);
    expect((await Book.findById(data.books.B01.id)).reviewCount).toBe(0);
    const restored = await request(app).post(`/api/admin/reviews/${review.id}/restore`).set(adminAuth);
    expect(restored.status).toBe(200);
    expect((await Book.findById(data.books.B01.id)).averageRating).toBe(2);
  });

  test('BR-6: a seller cannot review a book they actively list', async () => {
    await deliveredOrder(data.users['U-S01'], data.books.B01, data.listings.L01);
    const response = await request(app).post(`/api/books/${data.books.B01.id}/reviews`).set(sellerAuth).send({ rating: 4 });
    expect(response.status).toBe(403);
  });

  test('ST18: seller can create a listing for a catalog ISBN and manage only their listings', async () => {
    const path = '/api/listings';
    expect((await request(app).post(path).set(buyerAuth).send({ isbn: data.books.B02.isbn, price: 300, quantity: 1, condition: 'Good' })).status).toBe(403);
    const created = await request(app).post(path).set(sellerAuth).send({ isbn: data.books.B02.isbn, price: 300.5, quantity: 2, condition: 'Like New', notes: 'Clean pages' });
    expect(created.status).toBe(201);
    const listingId = created.body.listing.id;
    expect(created.body.listing).toMatchObject({ price: 300.5, quantity: 2, condition: 'Like New' });
    const edited = await request(app).patch(`${path}/${listingId}`).set(sellerAuth).send({ quantity: 0, price: 299 });
    expect(edited.status).toBe(200);
    expect((await request(app).patch(`${path}/${listingId}`).set(otherSellerAuth).send({ price: 100 })).status).toBe(404);
    expect((await request(app).get(`/api/books/${data.books.B02.id}/listings`)).body.listings.map((x) => x.id)).not.toContain(listingId);
  });

  test('ST19: open orders block removal; own listing can be removed after the order closes', async () => {
    const created = await request(app).post('/api/listings').set(sellerAuth).send({ isbn: data.books.B07.isbn, price: 150, quantity: 1, condition: 'Good' });
    expect(created.status).toBe(201);
    const listing = created.body.listing;
    await Order.create({ buyer: data.users['U-B01']._id, items: [{ listing: listing.id, book: data.books.B07.id, seller: data.users['U-S01']._id, quantity: 1, unitPrice: 150 }], totalAmount: 150, status: 'Placed' });
    expect((await request(app).delete(`/api/listings/${listing.id}`).set(sellerAuth)).status).toBe(409);
    await Order.updateOne({ 'items.listing': listing.id }, { $set: { status: 'Cancelled' } });
    expect((await request(app).delete(`/api/listings/${listing.id}`).set(sellerAuth)).status).toBe(200);
    expect(await Listing.findOne({ _id: listing.id, deletedAt: null })).toBeNull();
  });
});
