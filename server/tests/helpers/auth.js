const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { config } = require('../../src/config/env');
const { PASSWORD } = require('./fixtures');

async function login(app, email, password = PASSWORD) {
  return request(app).post('/api/auth/login').send({ email, password });
}

// Logs in and returns the bearer token.
async function tokenFor(app, user) {
  const res = await login(app, user.email);
  if (res.status !== 200) throw new Error(`Login failed for ${user.email}: ${res.status}`);
  return res.body.token;
}

// Signs a token with the test key, optionally back-dated (for the 24-hour boundary cases).
function signToken(user, { ageSeconds = 0, role = user.role, secret = config.jwtSecret } = {}) {
  const iat = Math.floor(Date.now() / 1000) - ageSeconds;
  return jwt.sign({ role, jti: crypto.randomUUID(), iat }, secret, {
    algorithm: 'HS256',
    subject: user.id,
    expiresIn: config.jwtExpiresInSeconds,
  });
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = { login, tokenFor, signToken, bearer };
