const express = require('express');
const cartController = require('../controllers/cartController');
const { authenticate, requireWriteAccess } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

function createCartRouter() {
  const router = express.Router();

  // All cart operations require an authenticated user.
  router.use(authenticate);

  // Retrieve the current user's cart.
  router.get('/', asyncHandler(cartController.getCart));

  // Add a listing to the cart.
  router.post(
    '/items',
    requireWriteAccess,
    asyncHandler(cartController.addItem),
  );

  // Support both methods for compatibility with existing clients.
  router.put(
    '/items/:listingId',
    requireWriteAccess,
    asyncHandler(cartController.updateItem),
  );

  router.patch(
    '/items/:listingId',
    requireWriteAccess,
    asyncHandler(cartController.updateItem),
  );

  // Remove one listing.
  router.delete(
    '/items/:listingId',
    requireWriteAccess,
    asyncHandler(cartController.removeItem),
  );

  // Empty the cart.
  router.delete(
    '/',
    requireWriteAccess,
    asyncHandler(cartController.clearCart),
  );

  return router;
}

module.exports = { createCartRouter };