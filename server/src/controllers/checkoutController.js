
const checkoutService = require('../services/checkoutService');

function getUserId(req) {
  return req.user.id || req.user._id || req.user.userId;
}

async function validateCheckout(req, res) {
  const summary = await checkoutService.validateCheckout(
    getUserId(req),
    req.body.addressId,
  );

  res.status(200).json({ checkout: summary });
}

async function createOrder(req, res) {
  const order = await checkoutService.createOrder(
    getUserId(req),
    req.body.addressId,
  );

  res.status(201).json({ order });
}

module.exports = {
  validateCheckout,
  createOrder,
};
