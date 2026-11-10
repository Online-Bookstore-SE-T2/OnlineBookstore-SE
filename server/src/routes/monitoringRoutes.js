const express = require('express');
const strings = require('../resources/strings');
const { createRateLimiter } = require('../middleware/rateLimit');
const { monitor, pingDatabase } = require('../monitoring/monitor');
const { asyncHandler } = require('../utils/asyncHandler');
const { AppError, ValidationError } = require('../utils/errors');

const MAX_PAGE_LOAD_MS = 120 * 1000;

// SASD 4.4.3 / NFR01-a: the browser reports how long the page took to load. One report per
// page load is expected, so 30 a minute per address allows normal use and stops one client
// from flooding the samples. The body is a single number; nothing about the visitor is kept.
function createMetricsRouter({ pageLoadLimit = 30 } = {}) {
  const router = express.Router();

  router.post('/page-load', createRateLimiter({ limit: pageLoadLimit, windowMs: 60 * 1000 }), (req, res, next) => {
    const durationMs = req.body?.durationMs;
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_PAGE_LOAD_MS) {
      return next(new ValidationError({ durationMs: strings.monitoring.invalidDuration }));
    }
    monitor.recordPageLoad(durationMs);
    return res.status(204).end();
  });

  return router;
}

// Readiness for the uptime check (SASD 4.4.3, NFR05): 200 only while the database answers.
// /api/health stays a plain liveness check for the platform's own health probe.
const readiness = asyncHandler(async (_req, res) => {
  if (!(await pingDatabase())) throw new AppError(503, strings.common.serviceUnavailable);
  res.json({ status: 'ok', database: 'up' });
});

module.exports = { createMetricsRouter, readiness };
