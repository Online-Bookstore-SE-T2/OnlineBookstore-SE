const express = require('express');
const paymentController = require('../controllers/paymentController');
const { asyncHandler } = require('../utils/asyncHandler');
const {
    authenticate,
    requireRole,
    requireWriteAccess,
} = require('../middleware/auth');
const { ROLES } = require('../constants');

function createPaymentRouter() {
    const router = express.Router();

    router.use(authenticate);
    router.use(requireRole(ROLES.BUYER));
    router.use(requireWriteAccess);

    router.post(
        '/orders/:orderId/simulate',
        asyncHandler(paymentController.simulatePayment),
    );

    return router;
}

module.exports = { createPaymentRouter };