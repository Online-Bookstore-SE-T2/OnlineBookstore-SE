const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const Order = require('../models/Order');
const { ORDER_STATUS } = require('../constants');
const { AppError } = require('../utils/errors');
const { config } = require('../config/env');
const notificationService = require('./notificationService');
const { releaseOrderStock } = require('./orderService');

async function simulatePayment(userId, orderId, outcome) {
    // Never expose simulated payment in production.
    if (config.env === 'production') {
        throw new AppError(404, 'Payment endpoint not found.');
    }

    if (!mongoose.isValidObjectId(orderId)) {
        throw new AppError(400, 'Invalid order ID.');
    }

    if (!['success', 'failure'].includes(outcome)) {
        throw new AppError(
            400,
            'Outcome must be success or failure.',
        );
    }

    const session = await mongoose.startSession();
    let order;

    try {
        await session.withTransaction(async () => {
            order = await Order.findOne({
                _id: orderId,
                buyer: userId,
            }).session(session);

            if (!order) {
                throw new AppError(404, 'Order not found.');
            }

            if (order.status === ORDER_STATUS.CANCELLED) {
                throw new AppError(409, 'Cannot pay for a cancelled order.');
            }

            if (
                order.status === ORDER_STATUS.PAID ||
                order.payment && order.payment.status === 'Paid'
            ) {
                throw new AppError(409, 'This order has already been paid.');
            }

            if (order.status !== ORDER_STATUS.PLACED) {
                throw new AppError(409, 'This order cannot be paid in its current state.');
            }

            // Only the server creates the simulated transaction reference.
            if (outcome === 'success') {
                order.payment = {
                    transactionRef: `SIM-${randomUUID()}`,
                    status: 'Paid',
                    failureReason: undefined,
                };
                order.status = ORDER_STATUS.PAID;
            } else {
                // REQ-11: a declined payment releases the reserved stock and
                // leaves no open order behind.
                order.payment = {
                    status: 'Failed',
                    failureReason: 'Simulated payment failure.',
                };
                await releaseOrderStock(order, session);
                order.status = ORDER_STATUS.CANCELLED;
            }

            await order.save({ session });
        });
    } finally {
        await session.endSession();
    }

    try {
        await notificationService.notifyPaymentOutcome(
            order,
            outcome === 'success'
        );
    } catch (error) {
        console.error('Failed to create payment notification:', error.message);
    }

    return order;
}

module.exports = { simulatePayment };