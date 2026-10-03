// UT02 - REQ-2 (FR02) login, session tokens and lockout (authService, tokenService).
const jwt = require('jsonwebtoken');
const User = require('../../src/models/User');
const RevokedToken = require('../../src/models/RevokedToken');
const { loginUser, isLocked, shouldLock } = require('../../src/services/authService');
const tokenService = require('../../src/services/tokenService');
const { config } = require('../../src/config/env');
const { useTestDatabase } = require('../helpers/db');
const { createUser, PASSWORD, WRONG_PASSWORD, USERS } = require('../helpers/fixtures');

useTestDatabase();

const failLogin = (email) => loginUser({ email, password: WRONG_PASSWORD }).catch((err) => err);

describe('UT02 tokenService', () => {
  test('issueToken signs HS256 with sub, role and jti, expiring exactly 24 hours after issue', async () => {
    const user = await createUser('U-B01');
    const { token, expiresAt } = tokenService.issueToken(user);
    const { header, payload } = jwt.decode(token, { complete: true });
    expect(header.alg).toBe('HS256');
    expect(payload.sub).toBe(user.id);
    expect(payload.role).toBe('Buyer');
    expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload.exp - payload.iat).toBe(86400);
    expect(expiresAt.getTime()).toBe(payload.exp * 1000);
  });

  test('verifyToken accepts a valid token and rejects tampered, foreign-key, unsigned and expired tokens', async () => {
    const user = await createUser('U-B01');
    const { token } = tokenService.issueToken(user);
    await expect(tokenService.verifyToken(token)).resolves.toMatchObject({ sub: user.id });

    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...jwt.decode(token), role: 'Administrator' })).toString('base64url');
    await expect(tokenService.verifyToken(`${h}.${forged}.${s}`)).rejects.toMatchObject({ status: 401 });

    const otherKey = jwt.sign({ jti: 'x' }, 'another-secret', { subject: user.id, expiresIn: 60 });
    await expect(tokenService.verifyToken(otherKey)).rejects.toMatchObject({ status: 401 });

    const unsigned = jwt.sign({ jti: 'x', sub: user.id }, '', { algorithm: 'none' });
    await expect(tokenService.verifyToken(unsigned)).rejects.toMatchObject({ status: 401 });

    const expired = jwt.sign({ jti: 'x', iat: Math.floor(Date.now() / 1000) - 90000 }, config.jwtSecret, {
      subject: user.id,
      expiresIn: 86400,
    });
    await expect(tokenService.verifyToken(expired)).rejects.toMatchObject({ status: 401 });

    const noJti = jwt.sign({}, config.jwtSecret, { subject: user.id, expiresIn: 60 });
    await expect(tokenService.verifyToken(noJti)).rejects.toMatchObject({ status: 401 });
  });

  test('revokeToken stores the jti until the token expiry and is idempotent', async () => {
    const user = await createUser('U-B01');
    const { token } = tokenService.issueToken(user);
    const payload = await tokenService.verifyToken(token);
    await tokenService.revokeToken(payload);
    await tokenService.revokeToken(payload);
    const entries = await RevokedToken.find({ jti: payload.jti }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0].expiresAt.getTime()).toBe(payload.exp * 1000);
    await expect(tokenService.verifyToken(token)).rejects.toMatchObject({ status: 401 });
  });

  test('extractBearerToken accepts only a well-formed Bearer header', () => {
    expect(tokenService.extractBearerToken('Bearer a.b.c')).toBe('a.b.c');
    expect(tokenService.extractBearerToken('bearer a.b.c')).toBeNull();
    expect(tokenService.extractBearerToken('Bearer ')).toBeNull();
    expect(tokenService.extractBearerToken('Basic dXNlcg==')).toBeNull();
    expect(tokenService.extractBearerToken(undefined)).toBeNull();
  });
});

describe('UT02 lockout rules', () => {
  test('isLocked is true only while the lock time is in the future', () => {
    const now = Date.now();
    expect(isLocked(undefined, now)).toBe(false);
    expect(isLocked(new Date(now + 1000), now)).toBe(true);
    expect(isLocked(new Date(now - 1000), now)).toBe(false);
  });

  test('shouldLock triggers at the fifth consecutive failure', () => {
    expect(shouldLock(4)).toBe(false);
    expect(shouldLock(5)).toBe(true);
  });
});

describe('UT02 loginUser', () => {
  test('returns the user and a token for correct credentials, regardless of e-mail case', async () => {
    await createUser('U-B01');
    const result = await loginUser({ email: 'Anita.Rao@TestMail.example', password: PASSWORD });
    expect(result.user.email).toBe(USERS['U-B01'].email);
    expect(typeof result.token).toBe('string');
  });

  test('wrong password and unknown e-mail give the same 401 message', async () => {
    await createUser('U-B01');
    const wrong = await failLogin(USERS['U-B01'].email);
    const unknown = await failLogin('nobody@testmail.example');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.message).toBe(unknown.message);
  });

  test('rejects non-string credentials with a validation error', async () => {
    const err = await loginUser({ email: {}, password: {} }).catch((e) => e);
    expect(err.status).toBe(400);
    expect(Object.keys(err.fields).sort()).toEqual(['email', 'password']);
  });

  test('a deleted account cannot log in', async () => {
    await createUser('U-B06', { status: 'Deleted' });
    expect((await loginUser({ email: USERS['U-B06'].email, password: PASSWORD }).catch((e) => e)).status).toBe(401);
  });

  test('five consecutive failures lock the account for 15 minutes and reset the counter', async () => {
    const user = await createUser('U-B03');
    for (let i = 1; i <= 4; i += 1) expect((await failLogin(user.email)).status).toBe(401);
    const fifth = await failLogin(user.email);
    expect(fifth.status).toBe(423);

    const stored = await User.findById(user.id).select('+failedLoginAttempts +lockUntil');
    expect(stored.failedLoginAttempts).toBe(0);
    const lockMs = stored.lockUntil.getTime() - Date.now();
    expect(lockMs).toBeGreaterThan(15 * 60 * 1000 - 5000);
    expect(lockMs).toBeLessThanOrEqual(15 * 60 * 1000);

    const correctWhileLocked = await loginUser({ email: user.email, password: PASSWORD }).catch((e) => e);
    expect(correctWhileLocked.status).toBe(423);
  });

  test('a success clears the failure count and any expired lock', async () => {
    const user = await createUser('U-B03', { failedLoginAttempts: 3, lockUntil: new Date(Date.now() - 1000) });
    await loginUser({ email: user.email, password: PASSWORD });
    const stored = await User.findById(user.id).select('+failedLoginAttempts +lockUntil');
    expect(stored.failedLoginAttempts).toBe(0);
    expect(stored.lockUntil).toBeUndefined();
  });

  test('a suspended account can still log in (read-only access)', async () => {
    await createUser('U-B04', { status: 'Suspended' });
    const result = await loginUser({ email: USERS['U-B04'].email, password: PASSWORD });
    expect(result.user.status).toBe('Suspended');
  });
});
