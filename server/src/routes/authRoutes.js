const express = require('express');
const authController = require('../controllers/authController');
const { asyncHandler } = require('../utils/asyncHandler');
const { createAuthRateLimiter } = require('../middleware/rateLimit');

// Authentication endpoints, rate limited per IP address (SRS 6.3).
function createAuthRouter({ rateLimit } = {}) {
  const router = express.Router();
  router.use(createAuthRateLimiter(rateLimit));

  router.post('/register', asyncHandler(authController.register));

  return router;
}

module.exports = { createAuthRouter };
