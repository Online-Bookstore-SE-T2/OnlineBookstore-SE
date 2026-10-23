const cartService = require('../services/cartService');

function getUserId(req) {
  const userId = req.user?.id || req.user?._id || req.user?.userId;

  if (!userId) {
    const { AppError } = require('../utils/errors');
    throw new AppError(401, 'Authentication required.');
  }

  return userId;
}

async function getCart(req, res) {
  const cart = await cartService.getCart(getUserId(req));
  res.status(200).json(cart);
}

async function addItem(req, res) {
  const cart = await cartService.addItem(
    getUserId(req),
    req.body?.listingId,
    req.body?.quantity ?? 1,
  );

  res.status(201).json(cart);
}

async function updateItem(req, res) {
  const cart = await cartService.updateItem(
    getUserId(req),
    req.params.listingId,
    req.body?.quantity,
  );

  res.status(200).json(cart);
}

async function removeItem(req, res) {
  const cart = await cartService.removeItem(
    getUserId(req),
    req.params.listingId,
  );

  res.status(200).json(cart);
}

async function clearCart(req, res) {
  const cart = await cartService.clearCart(getUserId(req));
  res.status(200).json(cart);
}

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
};