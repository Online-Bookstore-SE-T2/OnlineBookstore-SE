const cartService = require('../services/cartService');

function getUserId(req) {
  return req.user.id || req.user._id || req.user.userId;
}

async function getCart(req, res) {
  const cart = await cartService.getCart(getUserId(req));

  res.status(200).json({
    cart,
  });
}

async function addItem(req, res) {
  const { listingId, quantity } = req.body;

  const cart = await cartService.addItem(
    getUserId(req),
    listingId,
    quantity,
  );

  res.status(200).json({
    cart,
  });
}

async function updateItem(req, res) {
  const { listingId } = req.params;
  const { quantity } = req.body;

  const cart = await cartService.updateItem(
    getUserId(req),
    listingId,
    quantity,
  );

  res.status(200).json({
    cart,
  });
}

async function removeItem(req, res) {
  const { listingId } = req.params;

  const cart = await cartService.removeItem(
    getUserId(req),
    listingId,
  );

  res.status(200).json({
    cart,
  });
}

async function clearCart(req, res) {
  const cart = await cartService.clearCart(getUserId(req));

  res.status(200).json({
    cart,
  });
}

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
};