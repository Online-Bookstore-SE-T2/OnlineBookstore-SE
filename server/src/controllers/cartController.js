
const cartService = require('../services/cartService');

async function getCart(req, res) {
  const cart = await cartService.getCart(req.user._id);
  res.json(cart);
}

async function addItem(req, res) {
  const cart = await cartService.addItem(
    req.user._id,
    req.body?.listingId,
    req.body?.quantity ?? 1,
  );

  res.status(201).json(cart);
}

async function updateItem(req, res) {
  const cart = await cartService.updateItem(
    req.user._id,
    req.params.listingId,
    req.body?.quantity,
  );

  res.json(cart);
}

async function removeItem(req, res) {
  const cart = await cartService.removeItem(
    req.user._id,
    req.params.listingId,
  );

  res.json(cart);
}

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
};
