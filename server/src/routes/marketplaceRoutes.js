const express = require('express');
const controller = require('../controllers/marketplaceController');
const { asyncHandler } = require('../utils/asyncHandler');
const { authenticate, requireRole, requireWriteAccess } = require('../middleware/auth');
const { ROLES } = require('../constants');

function createBookMarketplaceRouter() {
  const router = express.Router();
  router.get('/:bookId', asyncHandler(controller.details));
  router.get('/:bookId/reviews', asyncHandler(controller.listReviews));
  router.get('/:bookId/reviews/mine', authenticate, requireRole(ROLES.BUYER, ROLES.SELLER), asyncHandler(controller.getMyReview));
  router.post('/:bookId/reviews', authenticate, requireWriteAccess, requireRole(ROLES.BUYER, ROLES.SELLER), asyncHandler(controller.createReview));
  router.put('/:bookId/reviews/mine', authenticate, requireWriteAccess, requireRole(ROLES.BUYER, ROLES.SELLER), asyncHandler(controller.updateReview));
  router.get('/:bookId/listings', asyncHandler(controller.listPublicListings));
  return router;
}

function createSellerListingRouter() {
  const router = express.Router();
  router.use(authenticate, requireWriteAccess, requireRole(ROLES.SELLER));
  router.get('/mine', asyncHandler(controller.listMyListings));
  router.post('/', asyncHandler(controller.createListing));
  router.patch('/:listingId', asyncHandler(controller.updateListing));
  router.delete('/:listingId', asyncHandler(controller.removeListing));
  return router;
}

module.exports = { createBookMarketplaceRouter, createSellerListingRouter };
