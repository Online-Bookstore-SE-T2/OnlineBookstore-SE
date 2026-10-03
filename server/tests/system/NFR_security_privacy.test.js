// Cross-cutting security and privacy checks (SRS 3.3, 6.3; NFR02, NFR10) owned by the accounts slice.
const path = require('path');
const { execSync } = require('child_process');
const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');
const { testApp } = require('../helpers/app');
const { useTestDatabase } = require('../helpers/db');
const { seedMarketplace, PASSWORD } = require('../helpers/fixtures');
const { tokenFor, bearer } = require('../helpers/auth');
const { enforceHttps } = require('../../src/middleware/https');
const { errorHandler } = require('../../src/middleware/errorHandler');
const { AppError } = require('../../src/utils/errors');

useTestDatabase();

function captureConsole() {
  const lines = [];
  const capture = (...args) => lines.push(args.join(' '));
  const spies = [jest.spyOn(console, 'log').mockImplementation(capture), jest.spyOn(console, 'error').mockImplementation(capture)];
  return { text: () => lines.join('\n'), restore: () => spies.forEach((spy) => spy.mockRestore()) };
}

describe('TC-NFR-SEC-03 / TC-NFR-SEC-20: no personal data in logs', () => {
  test('request logs record method, path and status only', async () => {
    const app = testApp({ logRequests: true });
    const marker = 'MarkerPwd#7391';
    const email = 'marker.user@testmail.example';
    const phone = '9876543210';
    const logs = captureConsole();
    try {
      await request(app).post('/api/auth/register').send({ name: 'Marker User', email, password: marker, phone });
      await request(app).post('/api/auth/login').send({ email, password: 'wrong' });
      const login = await request(app).post('/api/auth/login').send({ email, password: marker });
      const auth = bearer(login.body.token);
      await request(app).get('/api/users/me').set(auth);
      await request(app).patch('/api/users/me').set(auth).send({ phone: '9876500000' });
      await request(app).get(`/api/auth/session?email=${encodeURIComponent(email)}`).set(auth);

      const text = logs.text();
      expect(text).toContain('POST /api/auth/register 201');
      expect(text).toContain('GET /api/auth/session 200');
      for (const secret of [marker, email, phone, '9876500000', 'Marker User', login.body.token]) {
        expect(text).not.toContain(secret);
      }
    } finally {
      logs.restore();
    }
  });

  test('unexpected errors are answered generically and logged without their message', async () => {
    const app = express();
    app.get('/boom', () => {
      throw new Error('leaked anita.rao@testmail.example');
    });
    app.use(errorHandler);
    const logs = captureConsole();
    try {
      const res = await request(app).get('/boom');
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('anita');
      expect(logs.text()).toContain('[error] Error');
      expect(logs.text()).not.toContain('anita');
    } finally {
      logs.restore();
    }
  });

  test('database errors are mapped without echoing submitted values', async () => {
    const app = express();
    app.get('/validation', () => {
      const err = new mongoose.Error.ValidationError();
      err.addError('phone', new mongoose.Error.ValidatorError({ path: 'phone', value: '12345' }));
      throw err;
    });
    app.get('/cast', () => {
      throw new mongoose.Error.CastError('ObjectId', 'not-an-id', '_id');
    });
    app.get('/app', () => {
      throw new AppError(418, 'Custom', { field: 'x' });
    });
    app.use(errorHandler);
    const validation = await request(app).get('/validation');
    expect(validation.status).toBe(400);
    expect(JSON.stringify(validation.body)).not.toContain('12345');
    expect((await request(app).get('/cast')).status).toBe(404);
    expect((await request(app).get('/app')).body).toEqual({ error: { message: 'Custom', fields: { field: 'x' } } });
  });
});

describe('TC-NFR-SEC-04 / NFR10: no route returns a password or hash', () => {
  test('register, login, session, profile and admin responses are free of password data', async () => {
    const app = testApp();
    const data = await seedMarketplace();
    const adminAuth = bearer(await tokenFor(app, data.users.A01));
    const buyerAuth = bearer(await tokenFor(app, data.users['U-B01']));
    await request(app).post('/api/users/me/seller-request').set(buyerAuth).send({});

    const responses = await Promise.all([
      request(app).post('/api/auth/register').send({ name: 'New User', email: 'new.user@testmail.example', password: PASSWORD }),
      request(app).post('/api/auth/login').send({ email: data.users['U-B02'].email, password: PASSWORD }),
      request(app).get('/api/auth/session').set(buyerAuth),
      request(app).get('/api/users/me').set(buyerAuth),
      request(app).post('/api/admin/users/query').set(adminAuth).send({}),
      request(app).get(`/api/admin/users/${data.users['U-B01'].id}`).set(adminAuth),
      request(app).get('/api/admin/seller-requests').set(adminAuth),
      request(app).post(`/api/admin/users/${data.users['U-B04'].id}/suspend`).set(adminAuth),
    ]);
    for (const res of responses) {
      expect(res.status).toBeLessThan(300);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toMatch(/passwordHash|"password"|\$2[aby]\$|failedLoginAttempts|lockUntil/);
      expect(raw).not.toContain(PASSWORD);
    }
  });
});

describe('transport and request limits (SRS 3.3)', () => {
  const app = testApp();

  test('TC-NFR-SEC-23: only the deployed application origin receives a CORS allow header', async () => {
    const foreign = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
    const own = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(own.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  test('TC-NFR-SEC-24: a request body over 1 MB is rejected with 413', async () => {
    const big = { name: 'x'.repeat(1.1 * 1024 * 1024) };
    const res = await request(app).post('/api/auth/register').send(big);
    expect(res.status).toBe(413);
  });

  test('a body just under 1 MB is accepted for processing', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'x'.repeat(1000 * 1000) });
    expect(res.status).toBe(400);
  });

  test('security headers are set and the framework is not advertised', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  test('TC-NFR-SEC-17: plain HTTP is redirected (GET) or refused (other methods) when HTTPS is enforced', async () => {
    const httpsApp = express();
    httpsApp.use(enforceHttps);
    httpsApp.all('/x', (_req, res) => res.send('ok'));
    const get = await request(httpsApp).get('/x?y=1').set('Host', 'bookstore.example');
    expect(get.status).toBe(301);
    expect(get.headers.location).toBe('https://bookstore.example/x?y=1');
    expect((await request(httpsApp).post('/x')).status).toBe(403);

    const secureApp = express();
    secureApp.set('trust proxy', 1);
    secureApp.use(enforceHttps);
    secureApp.get('/x', (_req, res) => res.send('ok'));
    expect((await request(secureApp).get('/x').set('X-Forwarded-Proto', 'https')).status).toBe(200);
  });
});

describe('TC-NFR-SEC-21: secrets stay out of the repository', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const git = (args) => execSync(`git ${args}`, { cwd: repoRoot, encoding: 'utf8' });

  test('server/.env is ignored by git and no environment file other than the example is tracked', () => {
    expect(() => git('check-ignore -q server/.env')).not.toThrow();
    const tracked = git('ls-files').split('\n');
    expect(tracked.filter((file) => /(^|\/)\.env(\.|$)/.test(file))).toEqual(['server/.env.example']);
  });

  test('the client source never references server secrets', () => {
    const hits = git('grep -l -E "JWT_SECRET|MONGODB_URI|ADMIN_PASSWORD" -- client || true').trim();
    expect(hits).toBe('');
  });
});
