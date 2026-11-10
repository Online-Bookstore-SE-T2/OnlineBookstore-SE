const express = require('express');
const request = require('supertest');
const { createApp } = require('../../src/app');
const { createAuthRateLimiter } = require('../../src/middleware/rateLimit');
const { enforceHttps } = require('../../src/middleware/https');
const { requestId } = require('../../src/middleware/requestId');
const { requestLogger } = require('../../src/middleware/requestLogger');
const { errorHandler } = require('../../src/middleware/errorHandler');
const { AppError, ValidationError, errorCodeFor } = require('../../src/utils/errors');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('application shell', () => {
  const app = createApp();

  test('health route responds', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('unknown routes return a JSON 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBeDefined();
  });

  test('malformed JSON is rejected with 400', async () => {
    const res = await request(app).post('/api/health').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
  });
});

// SASD 4.4.1: each error class answers with its own code.
describe('error codes (SASD 4.4.1)', () => {
  test.each([
    [400, 'VALIDATION_FAILED'],
    [401, 'INVALID_CREDENTIALS'],
    [402, 'PAYMENT_FAILED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [429, 'TOO_MANY_ATTEMPTS'],
    [500, 'INTERNAL_ERROR'],
    [410, 'GONE'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [502, 'BAD_GATEWAY'],
    [503, 'SERVICE_UNAVAILABLE'],
    [418, 'BAD_REQUEST'],
    [504, 'INTERNAL_ERROR'],
  ])('status %i maps to %s', (status, code) => {
    expect(errorCodeFor(status)).toBe(code);
    expect(new AppError(status, 'x').code).toBe(code);
  });

  test('an AppError can name a more specific code', () => {
    expect(new AppError(409, 'x', undefined, 'OUT_OF_STOCK').code).toBe('OUT_OF_STOCK');
  });

  test('every error the handler builds carries a code next to the unchanged message and fields', async () => {
    const app = express();
    app.use(express.json());
    app.get('/validation', () => { throw new ValidationError({ name: 'Name is required.' }); });
    app.get('/forbidden', () => { throw new AppError(403, 'No.'); });
    app.post('/json', (_req, res) => res.json({}));
    app.use(errorHandler);

    const validation = await request(app).get('/validation');
    expect(validation.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Some fields are invalid. Please correct them and try again.',
        fields: { name: 'Name is required.' },
      },
    });
    expect((await request(app).get('/forbidden')).body).toEqual({ error: { code: 'FORBIDDEN', message: 'No.' } });
    const malformed = await request(app).post('/json').set('Content-Type', 'application/json').send('{bad');
    expect(malformed.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('framework-level refusals use the same shape', async () => {
    const app = createApp();
    expect((await request(app).get('/api/does-not-exist')).body.error.code).toBe('NOT_FOUND');
    const tooLarge = await request(app).post('/api/auth/login').send({ name: 'x'.repeat(1.1 * 1024 * 1024) });
    expect(tooLarge.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    const session = await request(app).get('/api/auth/session');
    expect(session.status).toBe(401);
    expect(session.body.error.code).toBe('INVALID_CREDENTIALS');

    const limited = express();
    limited.use(createAuthRateLimiter({ limit: 1, windowMs: 60000 }), (_req, res) => res.json({}));
    await request(limited).get('/');
    const throttled = await request(limited).get('/');
    expect(throttled.status).toBe(429);
    expect(throttled.body.error).toEqual({ code: 'TOO_MANY_ATTEMPTS', message: expect.stringMatching(/Too many requests/) });

    const plainHttp = express();
    plainHttp.use(enforceHttps);
    const refused = await request(plainHttp).post('/');
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('FORBIDDEN');
  });
});

// SASD 4.4.2: every request is logged with a correlation id, which 500 responses return.
describe('correlation id (SASD 4.4.2)', () => {
  function boomApp() {
    const app = express();
    app.use(requestId, requestLogger);
    app.get('/ok', (_req, res) => res.json({ ok: true }));
    app.get('/boom', () => { throw new Error('database exploded'); });
    app.use(errorHandler);
    return app;
  }

  function captureConsole() {
    const lines = [];
    const capture = (...args) => lines.push(args.join(' '));
    const spies = [jest.spyOn(console, 'log').mockImplementation(capture), jest.spyOn(console, 'error').mockImplementation(capture)];
    return { lines, restore: () => spies.forEach((spy) => spy.mockRestore()) };
  }

  test('every response carries a generated X-Request-Id', async () => {
    const app = createApp();
    const first = await request(app).get('/api/health');
    const second = await request(app).get('/api/does-not-exist');
    expect(first.headers['x-request-id']).toMatch(UUID);
    expect(second.headers['x-request-id']).toMatch(UUID);
    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });

  test('a 500 returns the id, and the request and error log lines carry the same id', async () => {
    const logs = captureConsole();
    try {
      const res = await request(boomApp()).get('/boom');
      expect(res.status).toBe(500);
      const id = res.headers['x-request-id'];
      expect(res.body).toEqual({
        error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again later.', correlationId: id },
      });
      const errorLine = logs.lines.find((line) => line.startsWith('[error]'));
      const requestLine = logs.lines.find((line) => line.includes('GET /boom 500'));
      expect(errorLine).toContain(`correlationId=${id}`);
      expect(requestLine).toContain(`[${id}]`);
      expect(logs.lines.join('\n')).not.toContain('database exploded');
    } finally {
      logs.restore();
    }
  });

  test('responses other than 500 do not put the id in the body', async () => {
    const res = await request(createApp()).get('/api/does-not-exist');
    expect(res.body.error.correlationId).toBeUndefined();
  });

  test('a well-formed incoming X-Request-Id is kept, so a proxy id can be followed through', async () => {
    const logs = captureConsole();
    try {
      const res = await request(boomApp()).get('/boom').set('X-Request-Id', 'proxy-abc123.XYZ');
      expect(res.headers['x-request-id']).toBe('proxy-abc123.XYZ');
      expect(res.body.error.correlationId).toBe('proxy-abc123.XYZ');
    } finally {
      logs.restore();
    }
  });

  test.each([
    ['spaces that could forge a log line', 'abc 2026-01-01T00:00:00Z GET /forged 200'],
    ['personal data', 'anita.rao@testmail.example'],
    ['too few characters', 'abc'],
    ['too many characters', 'a'.repeat(65)],
  ])('an incoming id with %s is replaced by a generated one', async (_case, incoming) => {
    const res = await request(boomApp()).get('/ok').set('X-Request-Id', incoming);
    expect(res.headers['x-request-id']).toMatch(UUID);
  });

  test('the error handler still answers with an id when no request id was assigned', async () => {
    const app = express();
    app.get('/boom', () => { throw new Error('x'); });
    app.use(errorHandler);
    const logs = captureConsole();
    try {
      const res = await request(app).get('/boom');
      expect(res.body.error.correlationId).toMatch(UUID);
    } finally {
      logs.restore();
    }
  });
});
