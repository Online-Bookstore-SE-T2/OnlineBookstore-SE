
const express = require('express');
const checkoutController = require('../controllers/checkoutController');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  authenticate,
  requireRole,
  requireWriteAccess,
} = require('../middleware/auth');
const { ROLES } = require('../constants');

function createCheckoutRouter() {
  const router = express.Router();

  router.use(authenticate);
  router.use(requireRole(ROLES.BUYER));
  router.use(requireWriteAccess);

  router.post(
    '/validate',
    asyncHandler(checkoutController.validateCheckout),
  );

  router.post(
    '/orders',
    asyncHandler(checkoutController.createOrder),
  );

  return router;
}

module.exports = { createCheckoutRouter };
