
const express = require('express');
const cartController = require('../controllers/cartController');
const { authenticate, requireWriteAccess } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

function createCartRouter() {
  const router = express.Router();

  router.use(authenticate);

  router.get('/', asyncHandler(cartController.getCart));

  router.post(
    '/items',
    requireWriteAccess,
    asyncHandler(cartController.addItem),
  );

  router.put(
    '/items/:listingId',
    requireWriteAccess,
    asyncHandler(cartController.updateItem),
  );

  router.delete(
    '/items/:listingId',
    requireWriteAccess,
    asyncHandler(cartController.removeItem),
  );

  return router;
}

module.exports = { createCartRouter };
