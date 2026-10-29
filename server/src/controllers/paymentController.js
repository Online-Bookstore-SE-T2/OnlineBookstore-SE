const paymentService = require('../services/paymentService');

function getUserId(req) {
    return req.user.id || req.user._id || req.user.userId;
}

async function simulatePayment(req, res) {
    const order = await paymentService.simulatePayment(
        getUserId(req),
        req.params.orderId,
        req.body.outcome,
    );

    res.status(200).json({
        message: order.payment.status === 'Paid' ?
            'Simulated payment successful.' :
            'Simulated payment failed.',
        order,
    });
}

async function getConfiguration(_req, res) {
    res.status(200).json({ payment: paymentService.getPaymentConfiguration() });
}

async function createIntent(req, res) {
    const intent = await paymentService.createPaymentIntent(
        getUserId(req),
        req.params.orderId,
    );
    res.status(201).json({ intent });
}

async function completeIntent(req, res) {
    const order = await paymentService.completeStripePayment(
        getUserId(req),
        req.params.orderId,
        req.body.transactionRef,
        req.body.failure === true,
    );
    res.status(200).json({ order });
}

module.exports = { simulatePayment, getConfiguration, createIntent, completeIntent };