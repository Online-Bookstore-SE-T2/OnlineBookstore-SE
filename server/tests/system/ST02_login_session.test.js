// ST02 - REQ-2 (FR02) login, session and lockout, through the HTTP API.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../../src/models/User');
const { createApp } = require('../../src/app');
const { testApp } = require('../helpers/app');
const { useTestDatabase } = require('../helpers/db');
const { createUser, PASSWORD, WRONG_PASSWORD, USERS } = require('../helpers/fixtures');
const { login, signToken, bearer } = require('../helpers/auth');

useTestDatabase();
const app = testApp();

const session = (token) => request(app).get('/api/auth/session').set(bearer(token));
const minutes = (n) => n * 60 * 1000;

describe('ST02 login and session', () => {
  test('TC-ST02-01: valid credentials log the user in and issue a JWT that opens the session', async () => {
    await createUser('U-B01');
    const res = await login(app, USERS['U-B01'].email);
    expect(res.status).toBe(200);
    expect(res.body.token.split('.')).toHaveLength(3);
    expect(res.body.user).toMatchObject({ name: 'Anita Rao', role: 'Buyer' });
    const me = await session(res.body.token);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(USERS['U-B01'].email);
  });

  test('TC-ST02-02: a wrong password is rejected and no token is issued', async () => {
    await createUser('U-B01');
    const res = await login(app, USERS['U-B01'].email, WRONG_PASSWORD);
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
    expect(res.body.error.message).toBe('Incorrect e-mail address or password.');
  });

  test('TC-ST02-03: an unregistered e-mail is rejected and no token is issued', async () => {
    const res = await login(app, 'nobody@testmail.example');
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  test('TC-ST02-04 / TC-NFR-SEC-05: the token is signed (HS256), carries the role and expires 86,400 s after issue', async () => {
    await createUser('U-B01');
    const { body } = await login(app, USERS['U-B01'].email);
    const { header, payload } = jwt.decode(body.token, { complete: true });
    expect(header.alg).toBe('HS256');
    expect(payload.role).toBe('Buyer');
    expect(payload.exp - payload.iat).toBe(86400);
  });

  test('TC-ST02-05: a token aged 23 h 59 min is still accepted', async () => {
    const user = await createUser('U-B01');
    const res = await session(signToken(user, { ageSeconds: 23 * 3600 + 59 * 60 }));
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Anita Rao');
  });

  test('TC-ST02-06: a token aged 24 h 01 min is rejected as unauthenticated', async () => {
    const user = await createUser('U-B01');
    const res = await session(signToken(user, { ageSeconds: 24 * 3600 + 60 }));
    expect(res.status).toBe(401);
    expect(res.body.user).toBeUndefined();
  });

  test('TC-ST02-07 / TC-NFR-SEC-25: log-out invalidates the token on the server (no replay)', async () => {
    await createUser('U-B01');
    const { body } = await login(app, USERS['U-B01'].email);
    const out = await request(app).post('/api/auth/logout').set(bearer(body.token));
    expect(out.status).toBe(200);
    const replay = await session(body.token);
    expect(replay.status).toBe(401);
    expect(replay.body.user).toBeUndefined();
  });

  test('TC-ST02-08: four failures then a success does not lock, and the count restarts after the success', async () => {
    await createUser('U-B03');
    const { email } = USERS['U-B03'];
    for (let i = 0; i < 4; i += 1) expect((await login(app, email, WRONG_PASSWORD)).status).toBe(401);
    expect((await login(app, email)).status).toBe(200);
    expect((await login(app, email, WRONG_PASSWORD)).status).toBe(401);
    expect((await login(app, email)).status).toBe(200);
  });

  test('TC-ST02-09: the fifth consecutive failure locks the account; the correct password is then refused', async () => {
    await createUser('U-B03');
    const { email } = USERS['U-B03'];
    for (let i = 0; i < 4; i += 1) await login(app, email, WRONG_PASSWORD);
    const fifth = await login(app, email, WRONG_PASSWORD);
    expect(fifth.status).toBe(423);
    const correct = await login(app, email);
    expect(correct.status).toBe(423);
    expect(correct.body.error.message).toMatch(/locked for 15 minutes/);
    expect(correct.body.token).toBeUndefined();
  });

  test('TC-ST02-10: the account is still locked 14 min 30 s after locking', async () => {
    await createUser('U-B03', { lockUntil: new Date(Date.now() + minutes(15) - minutes(14.5)) });
    const res = await login(app, USERS['U-B03'].email);
    expect(res.status).toBe(423);
  });

  test('TC-ST02-11: the account unlocks 15 min 01 s after locking', async () => {
    await createUser('U-B03', { lockUntil: new Date(Date.now() - 1000) });
    const res = await login(app, USERS['U-B03'].email);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('TC-ST02-12: a lockout affects only the locked account', async () => {
    await createUser('U-B03', { lockUntil: new Date(Date.now() + minutes(10)) });
    await createUser('U-B01');
    await createUser('U-B02');
    expect((await login(app, USERS['U-B01'].email)).status).toBe(200);
    expect((await login(app, USERS['U-B02'].email)).status).toBe(200);
    expect((await login(app, USERS['U-B03'].email)).status).toBe(423);
  });

  test('TC-NFR-SEC-06: a token whose payload was edited to Administrator is rejected', async () => {
    await createUser('U-B01');
    const { body } = await login(app, USERS['U-B01'].email);
    const [h, , s] = body.token.split('.');
    const payload = { ...jwt.decode(body.token), role: 'Administrator' };
    const forged = `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`;
    expect((await session(forged)).status).toBe(401);
  });

  test('TC-NFR-SEC-08: the session route without a token is refused', async () => {
    const res = await request(app).get('/api/auth/session');
    expect(res.status).toBe(401);
  });

  test('TC-NFR-SEC-11: operator objects in the login body are rejected with a validation error', async () => {
    await createUser('U-B01');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });

  test('a token for a deleted account is rejected', async () => {
    const user = await createUser('U-B06');
    const token = signToken(user);
    await User.updateOne({ _id: user._id }, { status: 'Deleted' });
    expect((await session(token)).status).toBe(401);
  });

  test('a token with a malformed subject is rejected', async () => {
    const token = signToken({ id: 'not-an-object-id', role: 'Buyer' });
    expect((await session(token)).status).toBe(401);
  });

  test('TC-NFR-SEC-03: a failed login does not echo the submitted password', async () => {
    await createUser('U-B01');
    const res = await login(app, USERS['U-B01'].email, 'MarkerPwd#7391');
    expect(JSON.stringify(res.body)).not.toContain('MarkerPwd#7391');
  });
});

describe('ST02 authentication rate limit (TC-NFR-SEC-16)', () => {
  test('10 requests per minute per IP are processed, the 11th is refused with 429, and the window resets', async () => {
    const limitedApp = createApp({ authRateLimit: { limit: 10, windowMs: 1500 } });
    const attempt = (i) => login(limitedApp, `nobody${i}@testmail.example`, PASSWORD);
    for (let i = 0; i < 10; i += 1) expect((await attempt(i)).status).toBe(401);
    const eleventh = await attempt(10);
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.error.message).toMatch(/Too many requests/);

    // Register and logout share the same limiter as login.
    expect((await request(limitedApp).post('/api/auth/register').send({})).status).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, 1600));
    expect((await attempt(11)).status).toBe(401);
  });

  test('the default limiter is configured for 10 requests per 60 seconds', () => {
    const { config } = require('../../src/config/env');
    expect(config.authRateLimit).toEqual({ windowMs: 60000, limit: 10 });
  });
});
