const { rateLimit } = require('express-rate-limit');
const { config } = require('../config/env');
const strings = require('../resources/strings');
const { errorBody } = require('../utils/errors');

// A per-IP request limit answering 429 TOO_MANY_ATTEMPTS in the common error shape.
function createRateLimiter({ limit, windowMs }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json(errorBody(429, strings.common.tooManyRequests));
    },
  });
}

// SRS 6.3: authentication endpoints are limited to 10 requests per minute per IP address.
function createAuthRateLimiter({ limit = config.authRateLimit.limit, windowMs = config.authRateLimit.windowMs } = {}) {
  return createRateLimiter({ limit, windowMs });
}

module.exports = { createRateLimiter, createAuthRateLimiter };
