const express = require('express');
const cartController = require('../controllers/cartController');
const { asyncHandler } = require('../utils/asyncHandler');
const { authenticate, requireWriteAccess } = require('../middleware/auth');

function createCartRouter() {
  const router = express.Router();

  // All cart operations require a logged-in user.
  router.use(authenticate);

  // View current cart.
  router.get('/', asyncHandler(cartController.getCart));

  // Add an item to the cart.
  router.post(
    '/items',
    requireWriteAccess,
    asyncHandler(cartController.addItem),
  );

  // Change item quantity.
  router.patch(
    '/items/:listingId',
    requireWriteAccess,
    asyncHandler(cartController.updateItem),
  );

  // Remove an item.
  router.delete(
    '/items/:listingId',
    requireWriteAccess,
    asyncHandler(cartController.removeItem),
  );

  // Remove all items.
  router.delete(
    '/',
    requireWriteAccess,
    asyncHandler(cartController.clearCart),
  );

  return router;
}

module.exports = { createCartRouter };