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

module.exports = { simulatePayment };