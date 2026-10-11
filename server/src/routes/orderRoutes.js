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
  router.use(requireRole(ROLES.BUYER));

  router.get('/', asyncHandler(orderController.listOrders));

  router.get('/:orderId', asyncHandler(orderController.getOrder));

  router.post(
    '/:orderId/cancel',
    requireWriteAccess,
    asyncHandler(orderController.cancelOrder)
  );

  return router;
}

module.exports = { createOrderRouter };