const { Cart, Listing } = require('../models');
const { LISTING_STATUS } = require('../constants');
const { AppError } = require('../utils/errors');

async function getCart(userId) {
  let cart = await Cart.findOne({ buyer: userId });

  if (!cart) {
    cart = await Cart.create({
      buyer: userId,
      items: [],
    });
  }

  return cart;
}

async function addItem(userId, listingId, quantity) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new AppError(400, 'Quantity must be a positive integer.');
  }

  const listing = await Listing.findOne({
    _id: listingId,
    status: LISTING_STATUS.ACTIVE,
  });

  if (!listing) {
    throw new AppError(404, 'Listing not found or unavailable.');
  }

  let cart = await Cart.findOne({ buyer: userId });

  if (!cart) {
    cart = await Cart.create({
      buyer: userId,
      items: [],
    });
  }

  const existingItem = cart.items.find(
    (item) => item.listing.toString() === listingId.toString(),
  );

  const newQuantity = existingItem
    ? existingItem.quantity + quantity
    : quantity;

  if (newQuantity > listing.quantity) {
    throw new AppError(
  409,
  `Only ${listing.quantity} item(s) are available.`,
);
  }

  if (existingItem) {
    existingItem.quantity = newQuantity;
  } else {
    cart.items.push({
      listing: listing._id,
      quantity,
    });
  }

  await cart.save();

  return cart;
}

async function updateItem(userId, listingId, quantity) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new AppError(400, 'Quantity must be a positive integer.');
  }

  const listing = await Listing.findOne({
    _id: listingId,
    status: LISTING_STATUS.ACTIVE,
  });

  if (!listing) {
    throw new AppError(404, 'Listing not found or unavailable.');
  }

  if (quantity > listing.quantity) {
  throw new AppError(
    409,
    `Only ${listing.quantity} item(s) are available.`,
  );
}
  const cart = await Cart.findOne({ buyer: userId });

  if (!cart) {
    throw new AppError(404, 'Cart not found.');  }

  const item = cart.items.find(
    (cartItem) => cartItem.listing.toString() === listingId.toString(),
  );

  if (!item) {
    throw new AppError(404, 'Item is not in the cart.');
  }

  item.quantity = quantity;

  await cart.save();

  return cart;
}

async function removeItem(userId, listingId) {
  const cart = await Cart.findOne({ buyer: userId });

  if (!cart) {
    throw new AppError(404, 'Cart not found.');
  }

  const originalLength = cart.items.length;

  cart.items = cart.items.filter(
    (item) => item.listing.toString() !== listingId.toString(),
  );

  if (cart.items.length === originalLength) {
    throw new AppError(404, 'Item is not in the cart.');
  }

  await cart.save();

  return cart;
}

async function clearCart(userId) {
  const cart = await Cart.findOne({ buyer: userId });

  if (!cart) {
    return {
      buyer: userId,
      items: [],
    };
  }

  cart.items = [];

  await cart.save();

  return cart;
}

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
};