const orderService = require('../services/orderService');

function getUserId(req) {
  return req.user.id || req.user._id || req.user.userId;
}

async function listOrders(req, res) {
  const orders = await orderService.getBuyerOrders(getUserId(req));

  res.status(200).json({ orders });
}

async function getOrder(req, res) {
  const order = await orderService.getBuyerOrder(
    getUserId(req),
    req.params.orderId
  );

  res.status(200).json({ order });
}

async function cancelOrder(req, res) {
  const order = await orderService.cancelBuyerOrder(
    getUserId(req),
    req.params.orderId
  );

  res.status(200).json({
    message: 'Order cancelled successfully. Stock has been restored.',
    order,
  });
}

module.exports = {
  listOrders,
  getOrder,
  cancelOrder,
};