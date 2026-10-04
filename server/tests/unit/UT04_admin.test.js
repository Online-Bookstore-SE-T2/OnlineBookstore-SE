// UT04 - REQ-4 (FR15) administration service, audit log and soft delete.
const { User, AuditLog, Book, Category, Listing, Order, Review } = require('../../src/models');
const adminService = require('../../src/services/adminService');
const userService = require('../../src/services/userService');
const { isWithinRetention } = require('../../src/models/plugins/softDelete');
const { useTestDatabase } = require('../helpers/db');
const { seedMarketplace, createUser } = require('../helpers/fixtures');

useTestDatabase();

const rejection = (promise) => promise.then(() => null, (err) => err);
const DAY = 24 * 60 * 60 * 1000;

let data;
let admin;
beforeEach(async () => {
  data = await seedMarketplace();
  admin = data.users.A01;
});

describe('UT04 listing and viewing', () => {
  test('lists 20 records per page, newest first, with totals', async () => {
    for (let i = 0; i < 25; i += 1) await createUser('U-B03', { email: `bulk${i}@testmail.example` });
    const first = await adminService.listRecords('users', {});
    const second = await adminService.listRecords('users', { page: 2 });
    expect(first.items).toHaveLength(20);
    expect(first.total).toBe(34);
    expect(first.totalPages).toBe(2);
    expect(second.items).toHaveLength(14);
    const ids = new Set([...first.items, ...second.items].map((u) => u.id));
    expect(ids.size).toBe(34);
  });

  test('filters by allowed role/status values only and searches case-insensitively', async () => {
    const sellers = await adminService.listRecords('users', { role: 'Seller' });
    expect(sellers.items.map((u) => u.name).sort()).toEqual(['Kiran Hegde', 'Latha Shenoy', 'Mohan Rao']);
    const ignored = await adminService.listRecords('users', { role: { $ne: null } });
    expect(ignored.total).toBe(9);
    const found = await adminService.listRecords('users', { q: 'ANITA' });
    expect(found.items.map((u) => u.email)).toEqual(['anita.rao@testmail.example']);
    const regexChars = await adminService.listRecords('books', { q: '.*' });
    expect(regexChars.total).toBe(0);
  });

  test('populates related names for listings, reviews and orders', async () => {
    const listings = await adminService.listRecords('listings', {});
    expect(listings.items[0].book.title).toBeDefined();
    expect(listings.items[0].seller.name).toBeDefined();
    const order = await adminService.getRecord('orders', data.orders['ORD-S04'].id);
    expect(order.buyer.name).toBe('Anita Rao');
    expect(order.items[0].book.title).toBe('Learning Data Structures');
  });

  test('unknown entity types and record IDs give 404', async () => {
    expect((await rejection(adminService.listRecords('passwords', {}))).status).toBe(404);
    expect((await rejection(adminService.listRecords('__proto__', {}))).status).toBe(404);
    expect((await rejection(adminService.getRecord('users', 'nope'))).status).toBe(404);
    expect((await rejection(adminService.getRecord('users', '64b000000000000000000000'))).status).toBe(404);
  });
});

describe('UT04 users, suspension and roles', () => {
  test('suspend and reinstate change the status and are audited', async () => {
    const target = data.users['U-B04'];
    await adminService.suspendUser(admin, target.id);
    expect((await User.findById(target.id)).status).toBe('Suspended');
    expect((await rejection(adminService.suspendUser(admin, target.id))).status).toBe(409);
    await adminService.reinstateUser(admin, target.id);
    expect((await User.findById(target.id)).status).toBe('Active');
    const actions = (await AuditLog.find({ targetId: target._id }).sort({ createdAt: 1 })).map((e) => e.action);
    expect(actions).toEqual(['suspend', 'reinstate']);
  });

  test('an administrator cannot suspend or delete their own account', async () => {
    expect((await rejection(adminService.suspendUser(admin, admin.id))).status).toBe(409);
    expect((await rejection(adminService.deleteRecord(admin, 'users', admin.id))).status).toBe(409);
  });

  test('promotion makes a user an administrator once', async () => {
    const target = data.users['U-B02'];
    await adminService.promoteToAdministrator(admin, target.id);
    expect((await User.findById(target.id)).role).toBe('Administrator');
    expect((await rejection(adminService.promoteToAdministrator(admin, target.id))).status).toBe(409);
    const entry = await AuditLog.findOne({ action: 'promote' });
    expect(entry.details).toEqual({ from: 'Buyer', to: 'Administrator' });
  });
});

describe('UT04 seller requests', () => {
  test('a buyer request can be approved, making the user a Seller', async () => {
    const buyer = data.users['U-B01'];
    await userService.requestSellerStatus(buyer, { note: 'Anita Book Corner' });
    expect((await adminService.listSellerRequests()).items.map((u) => u.id)).toEqual([buyer.id]);
    await adminService.approveSellerRequest(admin, buyer.id);
    const stored = await User.findById(buyer.id);
    expect(stored.role).toBe('Seller');
    expect(stored.sellerRequest).toMatchObject({ status: 'Approved', note: 'Anita Book Corner' });
    expect(stored.sellerRequest.decidedBy.equals(admin._id)).toBe(true);
    expect((await adminService.listSellerRequests()).total).toBe(0);
  });

  test('rejection requires a listed reason code and stores it', async () => {
    const buyer = data.users['U-B02'];
    await userService.requestSellerStatus(buyer, {});
    expect((await rejection(adminService.rejectSellerRequest(admin, buyer.id, { reasonCode: 'XXXX' }))).status).toBe(400);
    await adminService.rejectSellerRequest(admin, buyer.id, { reasonCode: 'INCD' });
    const stored = await User.findById(buyer.id);
    expect(stored.role).toBe('Buyer');
    expect(stored.rejectReasonCode).toBe('INCD');
    expect(stored.sellerRequest.status).toBe('Rejected');
  });

  test('requests are only for buyers, one pending at a time, and decisions need a pending request', async () => {
    expect((await rejection(userService.requestSellerStatus(data.users['U-S01'], {}))).status).toBe(409);
    const buyer = data.users['U-B04'];
    await userService.requestSellerStatus(buyer, {});
    expect((await rejection(userService.requestSellerStatus(buyer, {}))).status).toBe(409);
    expect((await rejection(adminService.approveSellerRequest(admin, data.users['U-B05'].id))).status).toBe(409);
    expect((await rejection(userService.requestSellerStatus(data.users['U-B05'], { note: 'x'.repeat(201) }))).status).toBe(400);
  });

  test('a rejected buyer may ask again', async () => {
    const buyer = data.users['U-B02'];
    await userService.requestSellerStatus(buyer, {});
    await adminService.rejectSellerRequest(admin, buyer.id, { reasonCode: 'OTHR' });
    const again = await userService.requestSellerStatus(await User.findById(buyer.id), { note: 'Now with details' });
    expect(again.sellerRequest.status).toBe('Pending');
  });
});

describe('UT04 soft delete, restore and delete guards', () => {
  test('deleting a user marks it Deleted with a deletion time; restore brings back the earlier status', async () => {
    const target = data.users['U-B06'];
    await adminService.suspendUser(admin, target.id);
    await adminService.deleteRecord(admin, 'users', target.id);
    let stored = await User.findById(target.id);
    expect(stored.status).toBe('Deleted');
    expect(stored.deletedAt).toBeInstanceOf(Date);
    expect((await adminService.listRecords('users', {})).items.map((u) => u.id)).not.toContain(target.id);
    expect((await adminService.listRecords('users', { deleted: true })).items.map((u) => u.id)).toEqual([target.id]);

    await adminService.restoreRecord(admin, 'users', target.id);
    stored = await User.findById(target.id).select('+statusBeforeDelete');
    expect(stored.status).toBe('Suspended');
    expect(stored.deletedAt).toBeNull();
    expect(stored.statusBeforeDelete).toBeUndefined();
  });

  test('restore is allowed up to 30 days after deletion and refused after', async () => {
    const review = data.reviews['B01-U-B05'];
    await Review.updateOne({ _id: review._id }, { deletedAt: new Date(Date.now() - 29 * DAY - 23 * 3600 * 1000) });
    await adminService.restoreRecord(admin, 'reviews', review.id);
    expect((await Review.findById(review.id)).deletedAt).toBeNull();

    await Review.updateOne({ _id: review._id }, { deletedAt: new Date(Date.now() - 30 * DAY - 60 * 1000) });
    expect((await rejection(adminService.restoreRecord(admin, 'reviews', review.id))).status).toBe(410);
    expect(isWithinRetention(new Date())).toBe(true);
    expect(isWithinRetention(null)).toBe(false);
  });

  test('restoring a live record and changing a deleted record are refused', async () => {
    const listing = data.listings.L08;
    expect((await rejection(adminService.restoreRecord(admin, 'listings', listing.id))).status).toBe(409);
    await adminService.deleteRecord(admin, 'listings', listing.id);
    expect((await rejection(adminService.suspendListing(admin, listing.id))).status).toBe(409);
    expect((await rejection(adminService.deleteRecord(admin, 'listings', listing.id))).status).toBe(409);
  });

  test('BR-5: books with active listings or open orders cannot be deleted; others can', async () => {
    expect((await rejection(adminService.deleteRecord(admin, 'books', data.books.B01.id))).status).toBe(409);
    // B05 has only a suspended listing but is in the open order ORD-S03.
    await adminService.suspendListing(admin, data.listings.L06.id);
    expect((await rejection(adminService.deleteRecord(admin, 'books', data.books.B05.id))).status).toBe(409);
    await adminService.deleteRecord(admin, 'books', data.books.B11.id);
    expect((await Book.findById(data.books.B11.id)).deletedAt).toBeInstanceOf(Date);
  });

  test('BR-5: a book can be marked unavailable and available again', async () => {
    await adminService.setBookAvailability(admin, data.books.B01.id, { available: false });
    expect((await Book.findById(data.books.B01.id)).markedUnavailable).toBe(true);
    await adminService.setBookAvailability(admin, data.books.B01.id, { available: true });
    expect((await Book.findById(data.books.B01.id)).markedUnavailable).toBe(false);
    expect((await rejection(adminService.setBookAvailability(admin, data.books.B01.id, { available: 'no' }))).status).toBe(400);
  });

  test('categories with books cannot be deleted; empty ones can', async () => {
    expect((await rejection(adminService.deleteRecord(admin, 'categories', data.categories.Fiction.id))).status).toBe(409);
    await adminService.deleteRecord(admin, 'categories', data.categories.Science.id);
    expect((await Category.findById(data.categories.Science.id)).deletedAt).toBeInstanceOf(Date);
  });

  test('open orders cannot be deleted; cancelled ones can', async () => {
    expect((await rejection(adminService.deleteRecord(admin, 'orders', data.orders['ORD-S03'].id))).status).toBe(409);
    expect((await rejection(adminService.deleteRecord(admin, 'orders', data.orders['ORD-S05'].id))).status).toBe(409);
    await adminService.deleteRecord(admin, 'orders', data.orders['ORD-S04'].id);
    expect((await Order.findById(data.orders['ORD-S04'].id)).deletedAt).toBeInstanceOf(Date);
  });

  test('listings can be suspended and reinstated', async () => {
    await adminService.suspendListing(admin, data.listings.L08.id);
    expect((await Listing.findById(data.listings.L08.id)).status).toBe('Suspended');
    expect((await rejection(adminService.suspendListing(admin, data.listings.L08.id))).status).toBe(409);
    await adminService.reinstateListing(admin, data.listings.L08.id);
    expect((await Listing.findById(data.listings.L08.id)).status).toBe('Active');
  });

  test('every soft-deletable collection has a 30-day TTL index on deletedAt', async () => {
    for (const model of [User, Book, Category, Listing, Review, Order]) {
      const indexes = await model.collection.indexes();
      const ttl = indexes.find((index) => index.key.deletedAt === 1);
      expect(ttl.expireAfterSeconds).toBe(30 * 24 * 60 * 60);
    }
  });
});

describe('UT04 categories', () => {
  test('create, rename and reject duplicate names regardless of case', async () => {
    const poetry = await adminService.createCategory(admin, { name: 'Poetry' });
    expect((await rejection(adminService.createCategory(admin, { name: 'poetry' }))).status).toBe(409);
    await adminService.renameCategory(admin, poetry.id, { name: 'Poetry and Drama' });
    expect((await Category.findById(poetry.id)).name).toBe('Poetry and Drama');
    expect((await rejection(adminService.renameCategory(admin, poetry.id, { name: 'FICTION' }))).status).toBe(409);
    expect((await rejection(adminService.createCategory(admin, { name: '' }))).status).toBe(400);
    const rename = await AuditLog.findOne({ action: 'rename' });
    expect(rename.details).toEqual({ from: 'Poetry', to: 'Poetry and Drama' });
  });
});

describe('UT04 audit log is immutable', () => {
  test('entries record actor, action, target and timestamp and cannot be changed or deleted', async () => {
    await adminService.suspendUser(admin, data.users['U-B04'].id);
    const entry = await AuditLog.findOne({ action: 'suspend' });
    expect(entry.actor.equals(admin._id)).toBe(true);
    expect(entry.targetType).toBe('User');
    expect(entry.targetId.equals(data.users['U-B04']._id)).toBe(true);
    expect(entry.targetLabel).toBe('Vikram Desai');
    expect(entry.createdAt).toBeInstanceOf(Date);

    await expect(AuditLog.updateOne({ _id: entry._id }, { action: 'x' })).rejects.toThrow(/cannot be changed/);
    await expect(AuditLog.findOneAndUpdate({ _id: entry._id }, { action: 'x' })).rejects.toThrow(/cannot be changed/);
    await expect(AuditLog.deleteOne({ _id: entry._id })).rejects.toThrow(/cannot be changed/);
    await expect(AuditLog.deleteMany({})).rejects.toThrow(/cannot be changed/);
    await expect(entry.deleteOne()).rejects.toThrow(/cannot be changed/);
    entry.action = 'tampered';
    await expect(entry.save()).rejects.toThrow(/cannot be changed/);
    expect((await AuditLog.findById(entry._id)).action).toBe('suspend');
  });
});
