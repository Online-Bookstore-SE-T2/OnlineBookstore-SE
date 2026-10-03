// ST04 - REQ-4 (FR15) administration console API, plus BR-3, BR-5 and SRS 6.2 safety cases.
const request = require('supertest');
const { User, AuditLog, Review, Book } = require('../../src/models');
const { testApp } = require('../helpers/app');
const { useTestDatabase } = require('../helpers/db');
const { seedMarketplace } = require('../helpers/fixtures');
const { tokenFor, bearer, login, signToken } = require('../helpers/auth');

useTestDatabase();
const app = testApp();

let data;
let adminAuth;
let buyerAuth;
let sellerAuth;
beforeEach(async () => {
  data = await seedMarketplace();
  adminAuth = bearer(await tokenFor(app, data.users.A01));
  buyerAuth = bearer(await tokenFor(app, data.users['U-B01']));
  sellerAuth = bearer(await tokenFor(app, data.users['U-S01']));
});

const query = (auth, entity, body = {}) => request(app).post(`/api/admin/${entity}/query`).set(auth).send(body);
const post = (auth, path, body) => request(app).post(`/api/admin${path}`).set(auth).send(body);
const del = (auth, path) => request(app).delete(`/api/admin${path}`).set(auth);

describe('ST04 console views', () => {
  test('TC-ST04-01: the administrator can list users, sellers, books, categories, listings, reviews and orders', async () => {
    const expected = { users: 9, books: 5, categories: 6, listings: 5, reviews: 1, orders: 3 };
    for (const [entity, total] of Object.entries(expected)) {
      const res = await query(adminAuth, entity);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(total);
    }
    const sellers = await query(adminAuth, 'users', { role: 'Seller' });
    expect(sellers.body.items.every((u) => u.role === 'Seller')).toBe(true);
    expect(sellers.body.total).toBe(3);
  });

  test('TC-ST04-08: an order can be viewed in detail and then deleted', async () => {
    const id = data.orders['ORD-S04'].id;
    const view = await request(app).get(`/api/admin/orders/${id}`).set(adminAuth);
    expect(view.status).toBe(200);
    expect(view.body.record).toMatchObject({ status: 'Cancelled', buyer: { name: 'Anita Rao' } });
    expect(view.body.record.items[0].book.title).toBe('Learning Data Structures');
    expect((await del(adminAuth, `/orders/${id}`)).status).toBe(200);
    expect((await query(adminAuth, 'orders')).body.items.map((o) => o.id)).not.toContain(id);
  });

  test('TC-NFR-SEC-04: admin user lists and details never contain password hashes', async () => {
    const list = await query(adminAuth, 'users');
    const detail = await request(app).get(`/api/admin/users/${data.users['U-B01'].id}`).set(adminAuth);
    const raw = JSON.stringify(list.body) + JSON.stringify(detail.body);
    expect(raw).not.toMatch(/passwordHash|failedLoginAttempts|lockUntil|statusBeforeDelete|\$2[aby]\$/);
  });

  test('TC-NFR-SEC-19: user search terms travel in the request body, not the URL', async () => {
    const res = await query(adminAuth, 'users', { q: 'anita.rao@testmail' });
    expect(res.body.items.map((u) => u.name)).toEqual(['Anita Rao']);
    expect((await request(app).get('/api/admin/users?q=anita').set(adminAuth)).status).toBe(404);
  });
});

describe('ST04 users and sellers', () => {
  test('TC-ST04-02 / TC-BR3-04: the administrator suspends a buyer', async () => {
    const res = await post(adminAuth, `/users/${data.users['U-B04'].id}/suspend`);
    expect(res.status).toBe(200);
    expect(res.body.record.status).toBe('Suspended');
    expect((await User.findById(data.users['U-B04'].id)).status).toBe('Suspended');
  });

  test('TC-ST04-03: the administrator suspends a seller', async () => {
    await post(adminAuth, `/users/${data.users['U-S03'].id}/suspend`);
    expect((await User.findById(data.users['U-S03'].id)).status).toBe('Suspended');
  });

  test('a suspended user can still log in but is read-only; reinstating restores write access', async () => {
    await post(adminAuth, `/users/${data.users['U-B04'].id}/suspend`);
    const res = await login(app, data.users['U-B04'].email);
    expect(res.status).toBe(200);
    const auth = bearer(res.body.token);
    expect((await request(app).patch('/api/users/me').set(auth).send({ name: 'X' })).status).toBe(403);
    await post(adminAuth, `/users/${data.users['U-B04'].id}/reinstate`);
    expect((await request(app).patch('/api/users/me').set(auth).send({ name: 'Vikram D' })).status).toBe(200);
  });

  test('TC-ST04-04 / TC-NFR-SAF-03 / TC-FLD-26: deleting a user is a soft delete (status Deleted, kept in the database)', async () => {
    const id = data.users['U-B06'].id;
    expect((await del(adminAuth, `/users/${id}`)).status).toBe(200);
    const stored = await User.findById(id);
    expect(stored.status).toBe('Deleted');
    expect(stored.deletedAt).toBeInstanceOf(Date);
    expect((await query(adminAuth, 'users')).body.items.map((u) => u.id)).not.toContain(id);
    expect((await login(app, data.users['U-B06'].email)).status).toBe(401);
  });

  test('TC-NFR-SAF-06: a soft-deleted user is restored and can log in again', async () => {
    const id = data.users['U-B06'].id;
    await del(adminAuth, `/users/${id}`);
    const deleted = await query(adminAuth, 'users', { deleted: true });
    expect(deleted.body.items.map((u) => u.id)).toEqual([id]);
    const res = await post(adminAuth, `/users/${id}/restore`);
    expect(res.status).toBe(200);
    expect(res.body.record.status).toBe('Active');
    expect((await login(app, data.users['U-B06'].email)).status).toBe(200);
  });

  test('TC-NFR-SAF-07: a record deleted 29 days 23 hours ago can still be restored', async () => {
    const id = data.users['U-B06'].id;
    await del(adminAuth, `/users/${id}`);
    await User.updateOne({ _id: id }, { deletedAt: new Date(Date.now() - (29 * 24 + 23) * 3600 * 1000) });
    expect((await post(adminAuth, `/users/${id}/restore`)).status).toBe(200);
  });

  test('records deleted more than 30 days ago can no longer be restored (410)', async () => {
    const id = data.users['U-B06'].id;
    await del(adminAuth, `/users/${id}`);
    await User.updateOne({ _id: id }, { deletedAt: new Date(Date.now() - 31 * 24 * 3600 * 1000) });
    expect((await post(adminAuth, `/users/${id}/restore`)).status).toBe(410);
  });

  test('an administrator can promote a user to Administrator, who then reaches the console', async () => {
    const res = await post(adminAuth, `/users/${data.users['U-B02'].id}/promote`);
    expect(res.body.record.role).toBe('Administrator');
    const promotedAuth = bearer(await tokenFor(app, data.users['U-B02']));
    expect((await query(promotedAuth, 'users')).status).toBe(200);
  });

  test('a promoted or suspended role takes effect on the next request with the same token', async () => {
    await post(adminAuth, `/users/${data.users['U-B01'].id}/promote`);
    expect((await query(buyerAuth, 'users')).status).toBe(200);
  });
});

describe('ST04 seller requests', () => {
  test('a buyer requests seller status, the admin approves, and the user becomes a Seller', async () => {
    const reqRes = await request(app).post('/api/users/me/seller-request').set(buyerAuth).send({ note: 'Anita Book Corner' });
    expect(reqRes.status).toBe(201);
    expect(reqRes.body.user.sellerRequest.status).toBe('Pending');

    const pending = await request(app).get('/api/admin/seller-requests').set(adminAuth);
    expect(pending.body.items).toHaveLength(1);
    expect(pending.body.items[0].sellerRequest.note).toBe('Anita Book Corner');

    const approve = await post(adminAuth, `/users/${data.users['U-B01'].id}/seller-request/approve`);
    expect(approve.body.record.role).toBe('Seller');
    const me = await request(app).get('/api/users/me').set(buyerAuth);
    expect(me.body.user.role).toBe('Seller');
  });

  test('rejection records the Appendix B reject reason code', async () => {
    await request(app).post('/api/users/me/seller-request').set(buyerAuth).send({});
    const bad = await post(adminAuth, `/users/${data.users['U-B01'].id}/seller-request/reject`, { reasonCode: 'NOPE' });
    expect(bad.status).toBe(400);
    const res = await post(adminAuth, `/users/${data.users['U-B01'].id}/seller-request/reject`, { reasonCode: 'POLV' });
    expect(res.body.record).toMatchObject({ role: 'Buyer', rejectReasonCode: 'POLV', sellerRequest: { status: 'Rejected' } });
  });

  test('sellers cannot request seller status again and duplicates are refused', async () => {
    expect((await request(app).post('/api/users/me/seller-request').set(sellerAuth).send({})).status).toBe(409);
    await request(app).post('/api/users/me/seller-request').set(buyerAuth).send({});
    expect((await request(app).post('/api/users/me/seller-request').set(buyerAuth).send({})).status).toBe(409);
  });
});

describe('ST04 reviews, categories, books and listings', () => {
  test('TC-ST04-05 / TC-BR3-05 / TC-NFR-SAF-05: removing a review soft-deletes it', async () => {
    const id = data.reviews['B01-U-B05'].id;
    expect((await del(adminAuth, `/reviews/${id}`)).status).toBe(200);
    expect((await Review.findById(id)).deletedAt).toBeInstanceOf(Date);
    expect((await query(adminAuth, 'reviews')).body.total).toBe(0);
  });

  test('TC-ST04-06 / TC-BR3-06: a category is added, renamed and deleted', async () => {
    const created = await post(adminAuth, '/categories', { name: 'Poetry' });
    expect(created.status).toBe(201);
    const id = created.body.record.id;
    const renamed = await request(app).patch(`/api/admin/categories/${id}`).set(adminAuth).send({ name: 'Poetry and Drama' });
    expect(renamed.body.record.name).toBe('Poetry and Drama');
    expect((await del(adminAuth, `/categories/${id}`)).status).toBe(200);
    const names = (await query(adminAuth, 'categories')).body.items.map((c) => c.name);
    expect(names).not.toContain('Poetry and Drama');
  });

  test('a duplicate category name is rejected', async () => {
    const res = await post(adminAuth, '/categories', { name: 'fiction' });
    expect(res.status).toBe(409);
    expect(res.body.error.fields.name).toMatch(/already exists/);
  });

  test('TC-ST04-07: a listing is suspended and shown as suspended', async () => {
    const id = data.listings.L08.id;
    const res = await post(adminAuth, `/listings/${id}/suspend`);
    expect(res.body.record.status).toBe('Suspended');
    const active = (await query(adminAuth, 'listings', { status: 'Active' })).body.items.map((l) => l.id);
    expect(active).not.toContain(id);
  });

  test('TC-BR5-01: a book with active listings cannot be deleted', async () => {
    const res = await del(adminAuth, `/books/${data.books.B01.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/Mark it unavailable/);
    expect((await Book.findById(data.books.B01.id)).deletedAt).toBeNull();
  });

  test('TC-BR5-02: a book in an open order cannot be deleted', async () => {
    await post(adminAuth, `/listings/${data.listings.L06.id}/suspend`);
    expect((await del(adminAuth, `/books/${data.books.B05.id}`)).status).toBe(409);
  });

  test('TC-BR5-03: a book with active listings is marked unavailable and still exists', async () => {
    const res = await request(app).patch(`/api/admin/books/${data.books.B01.id}/availability`).set(adminAuth).send({ available: false });
    expect(res.body.record.markedUnavailable).toBe(true);
    expect(await Book.exists({ _id: data.books.B01._id })).toBeTruthy();
  });

  test('TC-BR5-04: a book with no listings or open orders is deleted', async () => {
    expect((await del(adminAuth, `/books/${data.books.B11.id}`)).status).toBe(200);
    expect((await query(adminAuth, 'books')).body.items.map((b) => b.title)).not.toContain('Orchard Care Handbook');
  });

  test('a category that still has books cannot be deleted; an open order cannot be deleted', async () => {
    expect((await del(adminAuth, `/categories/${data.categories.Fiction.id}`)).status).toBe(409);
    expect((await del(adminAuth, `/orders/${data.orders['ORD-S03'].id}`)).status).toBe(409);
  });
});

describe('ST04 access control (REQ-4 403 rule, BR-3)', () => {
  const adminCalls = (d) => [
    ['list users', (auth) => query(auth, 'users')],
    ['view user', (auth) => request(app).get(`/api/admin/users/${d.users['U-B04'].id}`).set(auth)],
    ['suspend U-B04', (auth) => post(auth, `/users/${d.users['U-B04'].id}/suspend`)],
    ['delete a review', (auth) => del(auth, `/reviews/${d.reviews['B01-U-B05'].id}`)],
    ['create a category', (auth) => post(auth, '/categories', { name: 'Poetry' })],
    ['rename a category', (auth) => request(app).patch(`/api/admin/categories/${d.categories.Fiction.id}`).set(auth).send({ name: 'X' })],
    ['delete a category', (auth) => del(auth, `/categories/${d.categories.Science.id}`)],
    ['delete a book', (auth) => del(auth, `/books/${d.books.B11.id}`)],
    ['promote', (auth) => post(auth, `/users/${d.users['U-B02'].id}/promote`)],
    ['audit log', (auth) => request(app).get('/api/admin/audit-log').set(auth)],
    ['seller requests', (auth) => request(app).get('/api/admin/seller-requests').set(auth)],
  ];

  async function expectNoChanges() {
    expect((await User.findById(data.users['U-B04'].id)).status).toBe('Active');
    expect((await User.findById(data.users['U-B02'].id)).role).toBe('Buyer');
    expect((await Review.findById(data.reviews['B01-U-B05'].id)).deletedAt).toBeNull();
    expect(await AuditLog.countDocuments()).toBe(0);
  }

  test('TC-ST04-09 / TC-BR3-01..03: every admin route returns 403 to a buyer and changes nothing', async () => {
    for (const [, call] of adminCalls(data)) {
      const res = await call(buyerAuth);
      expect(res.status).toBe(403);
      expect(res.body.items).toBeUndefined();
      expect(res.body.record).toBeUndefined();
    }
    await expectNoChanges();
  });

  test('TC-ST04-10: every admin route returns 403 to a seller and changes nothing', async () => {
    for (const [, call] of adminCalls(data)) expect((await call(sellerAuth)).status).toBe(403);
    await expectNoChanges();
  });

  test('TC-ST04-11 / TC-NFR-SEC-08: admin routes without a token, or with an invalid token, return 403', async () => {
    expect((await request(app).post('/api/admin/users/query').send({})).status).toBe(403);
    expect((await query({ Authorization: 'Bearer not.a.token' }, 'users')).status).toBe(403);
  });

  test('TC-NFR-SEC-06: a buyer token re-signed with a forged Administrator role and the wrong key is refused', async () => {
    const forged = signToken(data.users['U-B01'], { role: 'Administrator', secret: 'attacker-key' });
    expect((await query(bearer(forged), 'users')).status).toBe(403);
  });

  test('a role claim alone does not grant access: the stored role is what counts', async () => {
    const claimsAdmin = signToken(data.users['U-B01'], { role: 'Administrator' });
    expect((await query(bearer(claimsAdmin), 'users')).status).toBe(403);
  });

  test('a suspended administrator can view the console but cannot change anything', async () => {
    const second = data.users['U-B02'];
    await post(adminAuth, `/users/${second.id}/promote`);
    await post(adminAuth, `/users/${second.id}/suspend`);
    const auth = bearer(await tokenFor(app, second));
    expect((await query(auth, 'users')).status).toBe(200);
    expect((await post(auth, `/users/${data.users['U-B04'].id}/suspend`)).status).toBe(403);
  });
});

describe('ST04 audit log (TC-NFR-SAF-11, TC-NFR-SAF-12)', () => {
  test('each administrative action writes one entry with actor, action, target and timestamp', async () => {
    await post(adminAuth, `/users/${data.users['U-B04'].id}/suspend`);
    await del(adminAuth, `/reviews/${data.reviews['B01-U-B05'].id}`);
    await request(app).patch(`/api/admin/categories/${data.categories.Cooking.id}`).set(adminAuth).send({ name: 'Cookery' });
    await del(adminAuth, `/listings/${data.listings.L08.id}`);

    const res = await request(app).get('/api/admin/audit-log').set(adminAuth);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(4);
    const summary = res.body.items.map((e) => [e.action, e.targetType]).reverse();
    expect(summary).toEqual([
      ['suspend', 'User'],
      ['delete', 'Review'],
      ['rename', 'Category'],
      ['delete', 'Listing'],
    ]);
    for (const entry of res.body.items) {
      expect(entry.actor.name).toBe('Admin User One');
      expect(entry.targetId).toMatch(/^[a-f0-9]{24}$/);
      expect(entry.createdAt).toMatch(/Z$/);
    }
  });

  test('there is no API route to edit or delete audit entries, and entries survive deletion of their target', async () => {
    await post(adminAuth, `/users/${data.users['U-B04'].id}/suspend`);
    const [entry] = (await request(app).get('/api/admin/audit-log').set(adminAuth)).body.items;
    expect((await del(adminAuth, `/audit-log/${entry.id}`)).status).toBe(404);
    expect((await request(app).patch(`/api/admin/audit-log/${entry.id}`).set(adminAuth).send({})).status).toBe(404);

    await del(adminAuth, `/users/${data.users['U-B04'].id}`);
    const after = (await request(app).get('/api/admin/audit-log').set(adminAuth)).body.items;
    expect(after.find((e) => e.id === entry.id)).toMatchObject({ action: 'suspend', targetLabel: 'Vikram Desai' });
  });
});
