const express = require('express');
const authController = require('../controllers/authController');
const { asyncHandler } = require('../utils/asyncHandler');
const { createAuthRateLimiter } = require('../middleware/rateLimit');
const { authenticate } = require('../middleware/auth');

// Authentication endpoints. Register, login and logout share one limiter of 10 requests per
// minute per IP address (SRS 6.3); reading the current session is not an authentication attempt.
function createAuthRouter({ rateLimit } = {}) {
  const router = express.Router();
  const limiter = createAuthRateLimiter(rateLimit);

  router.post('/register', limiter, asyncHandler(authController.register));
  router.post('/login', limiter, asyncHandler(authController.login));
  router.post('/logout', limiter, authenticate, asyncHandler(authController.logout));
  router.get('/session', authenticate, asyncHandler(authController.session));

  return router;
}

module.exports = { createAuthRouter };
