const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const RevokedToken = require('../models/RevokedToken');
const strings = require('../resources/strings');
const { AppError } = require('../utils/errors');

const ALGORITHM = 'HS256';

// REQ-2 / RFC 7519: a signed JWT carrying the user ID (sub), the role claim and a unique ID (jti),
// valid for 24 hours from issue.
function issueToken(user) {
  const token = jwt.sign({ role: user.role, jti: crypto.randomUUID() }, config.jwtSecret, {
    algorithm: ALGORITHM,
    subject: user.id,
    expiresIn: config.jwtExpiresInSeconds,
  });
  const { exp } = jwt.decode(token);
  return { token, expiresAt: new Date(exp * 1000) };
}

function sessionError() {
  return new AppError(401, strings.auth.sessionInvalid);
}

// Verifies signature, algorithm and expiry, then rejects tokens revoked by log-out.
async function verifyToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: [ALGORITHM] });
  } catch {
    throw sessionError();
  }
  if (!payload.sub || !payload.jti) throw sessionError();
  if (await RevokedToken.exists({ jti: payload.jti })) throw sessionError();
  return payload;
}

// REQ-2: log-out invalidates the session on the server, not just in the browser.
async function revokeToken(payload) {
  await RevokedToken.updateOne(
    { jti: payload.jti },
    { $setOnInsert: { jti: payload.jti, expiresAt: new Date(payload.exp * 1000) } },
    { upsert: true },
  );
}

function extractBearerToken(header) {
  if (typeof header !== 'string') return null;
  const match = /^Bearer ([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/.exec(header.trim());
  return match ? match[1] : null;
}

module.exports = { issueToken, verifyToken, revokeToken, extractBearerToken, sessionError };
