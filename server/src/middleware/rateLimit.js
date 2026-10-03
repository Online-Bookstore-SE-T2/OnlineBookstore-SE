const { rateLimit } = require('express-rate-limit');
const { config } = require('../config/env');
const strings = require('../resources/strings');

// SRS 6.3: authentication endpoints are limited to 10 requests per minute per IP address.
function createAuthRateLimiter({ limit = config.authRateLimit.limit, windowMs = config.authRateLimit.windowMs } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: { message: strings.common.tooManyRequests } });
    },
  });
}

module.exports = { createAuthRateLimiter };
