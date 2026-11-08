// SASD 4.4.3 / NFR01 / NFR05 monitoring, through the HTTP API: each metric is fed by the
// real request paths, and only administrators can read them.
const express = require('express');
const request = require('supertest');
const { testApp } = require('../helpers/app');
const { useTestDatabase } = require('../helpers/db');
const { seedMarketplace, WRONG_PASSWORD } = require('../helpers/fixtures');
const { tokenFor, bearer, login } = require('../helpers/auth');
const { User, Cart } = require('../../src/models');
const { monitor } = require('../../src/monitoring/monitor');
const { errorHandler } = require('../../src/middleware/errorHandler');

useTestDatabase();

const metric = (snapshot, id) => snapshot.items.find((item) => item.id === id);

describe('NFR monitoring metrics (SASD 4.4.3)', () => {
  let app;
  let data;
  let adminAuth;
  let buyerAuth;

  beforeEach(async () => {
    app = testApp();
    data = await seedMarketplace();
    adminAuth = bearer(await tokenFor(app, data.users.A01));
    buyerAuth = bearer(await tokenFor(app, data.users['U-B01']));
    monitor.reset();
  });

  async function snapshot() {
    const res = await request(app).get('/api/admin/monitoring').set(adminAuth);
    expect(res.status).toBe(200);
    return res.body;
  }

  test('only administrators can read the metrics (403 otherwise, even without a token, as for every admin route)', async () => {
    expect((await request(app).get('/api/admin/monitoring')).status).toBe(403);
    const buyer = await request(app).get('/api/admin/monitoring').set(buyerAuth);
    expect(buyer.status).toBe(403);
    expect(buyer.body.error.code).toBe('FORBIDDEN');
  });

  test('the snapshot lists every metric with its threshold, window and status, as one table page', async () => {
    const body = await snapshot();
    expect(body).toMatchObject({ page: 1, totalPages: 1, total: 9 });
    expect(body.instance).toEqual(expect.any(String));
    expect(body.items.map((item) => item.id)).toEqual([
      'checkoutFailureRate', 'orderCommitAbortRate', 'searchResponseP95', 'pageLoadP95', 'api5xxRate',
      'failedLoginsPerMinute', 'emailPermanentFailures', 'dbPoolUtilisation', 'databaseAvailability',
    ]);
    expect(metric(body, 'searchResponseP95')).toMatchObject({ unit: 'ms', threshold: 2000, windowMinutes: 15 });
    expect(JSON.stringify(body)).not.toMatch(/@testmail\.example|Anita/);
  });

  test('API requests and search response times are recorded', async () => {
    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).get('/api/books/search?q=the')).status).toBe(200);
    }
    const body = await snapshot();
    expect(metric(body, 'searchResponseP95')).toMatchObject({ samples: 3, status: 'no-data' });
    expect(metric(body, 'searchResponseP95').value).toBeGreaterThan(0);
    expect(body.totals.requests).toBeGreaterThanOrEqual(3);
  });

  test('a 5xx response counts toward the API 5xx rate', async () => {
    const failing = express();
    failing.use(monitor.middleware());
    failing.get('/api/boom', () => { throw new Error('boom'); });
    failing.get('/not-api', (_req, res) => res.status(500).end());
    failing.use(errorHandler);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await request(failing).get('/api/boom');
      await request(failing).get('/not-api');
    } finally {
      spy.mockRestore();
    }
    expect(monitor.snapshot().totals).toMatchObject({ requests: 1, errors5xx: 1 });
  });

  describe('checkout and order commitment', () => {
    let addressId;

    beforeEach(async () => {
      const buyer = await User.findById(data.users['U-B01']._id);
      buyer.addresses.push({ line: 'Flat 12, Lakeview Apartments', city: 'Bengaluru', state: 'Karnataka', postalCode: '560011' });
      await buyer.save();
      addressId = buyer.addresses[0]._id.toString();
    });

    const fillCart = (quantity) => Cart.findOneAndUpdate(
      { buyer: data.users['U-B01']._id },
      { $set: { items: [{ listing: data.listings.L01._id, quantity }] } },
      { upsert: true, new: true },
    );
    const placeOrder = (body = { addressId }) => request(app).post('/api/checkout/orders').set(buyerAuth).send(body);
    const pay = (orderId, outcome) => request(app).post(`/api/payments/orders/${orderId}/simulate`).set(buyerAuth).send({ outcome });

    test('a placed order and a successful payment count as one good checkout', async () => {
      await fillCart(1);
      const placed = await placeOrder();
      expect(placed.status).toBe(201);
      expect((await pay(placed.body.order.id, 'success')).status).toBe(200);
      const body = await snapshot();
      expect(metric(body, 'checkoutFailureRate')).toMatchObject({ value: 0, samples: 1 });
      expect(metric(body, 'orderCommitAbortRate')).toMatchObject({ value: 0, samples: 1 });
    });

    test('a declined payment fails the checkout', async () => {
      await fillCart(1);
      const placed = await placeOrder();
      expect((await pay(placed.body.order.id, 'failure')).body.order.payment.status).toBe('Failed');
      expect(metric(await snapshot(), 'checkoutFailureRate')).toMatchObject({ value: 1, samples: 1 });
    });

    test('stock that ran out fails the checkout and aborts the order commit', async () => {
      await fillCart(9999);
      const placed = await placeOrder();
      expect(placed.status).toBe(409);
      const body = await snapshot();
      expect(metric(body, 'checkoutFailureRate')).toMatchObject({ value: 1, samples: 1 });
      expect(metric(body, 'orderCommitAbortRate')).toMatchObject({ value: 1, samples: 1 });
    });

    test('a request refused before anything is written is neither a checkout nor a commit', async () => {
      await fillCart(1);
      expect((await placeOrder({ addressId: 'not-an-id' })).status).toBe(400);
      const body = await snapshot();
      expect(metric(body, 'checkoutFailureRate').samples).toBe(0);
      expect(metric(body, 'orderCommitAbortRate').samples).toBe(0);
    });
  });

  test('failed logins and lockouts are counted without recording who tried', async () => {
    const { email } = data.users['U-B02'];
    for (let i = 0; i < 5; i += 1) await login(app, email, WRONG_PASSWORD);
    await login(app, 'nobody@testmail.example', WRONG_PASSWORD);
    const body = await snapshot();
    expect(metric(body, 'failedLoginsPerMinute').value).toBe(6);
    expect(body.totals).toMatchObject({ loginFailures: 6, lockouts: 1 });
    expect(JSON.stringify(body)).not.toContain(email);
  });

  describe('browser page-load reports (NFR01-a)', () => {
    test('a valid report is accepted without authentication and recorded', async () => {
      const res = await request(app).post('/api/metrics/page-load').send({ durationMs: 1234.5 });
      expect(res.status).toBe(204);
      expect(metric(await snapshot(), 'pageLoadP95')).toMatchObject({ value: 1234.5, samples: 1 });
    });

    test.each([[undefined], ['1200'], [0], [-5], [120001], [{ $gt: 1 }]])('rejects durationMs %p', async (durationMs) => {
      const res = await request(app).post('/api/metrics/page-load').send({ durationMs });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_FAILED', fields: { durationMs: expect.any(String) } });
      expect(metric(monitor.snapshot(), 'pageLoadP95').samples).toBe(0);
    });

    test('reports are limited per address', async () => {
      const limited = testApp();
      let last;
      for (let i = 0; i < 31; i += 1) last = await request(limited).post('/api/metrics/page-load').send({ durationMs: 800 });
      expect(last.status).toBe(429);
      expect(last.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    });
  });

  test('NFR05: the readiness check answers 200 while the database is up', async () => {
    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });
});
