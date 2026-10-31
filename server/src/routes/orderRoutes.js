const express = require('express');
const orderController = require('../controllers/orderController');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  authenticate,
  requireRole,
  requireWriteAccess,
} = require('../middleware/auth');
const { ROLES } = require('../constants');

function createOrderRouter() {
  const router = express.Router();

  router.use(authenticate);

  router.get(
    '/seller',
    requireRole(ROLES.SELLER),
    asyncHandler(orderController.listSellerOrders)
  );

  router.patch(
    '/seller/:orderId/status',
    requireRole(ROLES.SELLER),
    requireWriteAccess,
    asyncHandler(orderController.advanceSellerOrder)
  );

  router.get('/', requireRole(ROLES.BUYER), asyncHandler(orderController.listOrders));

  router.get('/:orderId', requireRole(ROLES.BUYER), asyncHandler(orderController.getOrder));

  router.post(
    '/:orderId/cancel',
    requireRole(ROLES.BUYER),
    requireWriteAccess,
    asyncHandler(orderController.cancelOrder)
  );

  return router;
}

module.exports = { createOrderRouter };