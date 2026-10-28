
const mongoose = require('mongoose');
const { Cart, Listing } = require('../models');
const { LISTING_STATUS } = require('../constants');
const { AppError } = require('../utils/errors');
const strings = require('../resources/strings');

function validateId(id) {
  return mongoose.isValidObjectId(id);
}

function validateQuantity(quantity) {
  return Number.isInteger(quantity) && quantity >= 1;
}

function invalidQuantityError() {
  return new AppError(400, 'Quantity must be a positive whole number.', {
    quantity: 'Quantity must be a positive whole number.',
  });
}

// SASD 4.3.2: a quantity above the listing's stock is a conflict (409).
function exceedsStockError(listing) {
  const message = `Only ${listing.quantity} item(s) are currently available.`;
  return new AppError(409, message, { quantity: message });
}

function emptyCart(buyerId) {
  return {
    buyer: String(buyerId),
    items: [],
    itemCount: 0,
    subtotal: 0,
  };
}

async function getActiveListing(listingId) {
  if (!validateId(listingId)) {
    throw new AppError(404, 'Listing not found.');
  }

  const listing = await Listing.findOne({
    _id: listingId,
    deletedAt: null,
    status: LISTING_STATUS.ACTIVE,
    quantity: mongoose.trusted({ $gt: 0 }),
  })
    .populate({
      path: 'book',
      select: 'title author coverImageUrl markedUnavailable deletedAt',
      match: { deletedAt: null },
    })
    .populate('seller', 'name')
    .lean();

  if (!listing || !listing.book || listing.book.markedUnavailable) {
    throw new AppError(404, 'Listing not found.');
  }

  return listing;
}

async function getOrCreateCart(buyerId) {
  const existingCart = await Cart.findOne({
    buyer: buyerId,
    deletedAt: null,
  });

  if (existingCart) {
    return existingCart;
  }

  // Restore a soft-deleted cart instead of creating a duplicate.
  const deletedCart = await Cart.findOneAndUpdate(
    {
      buyer: buyerId,
      deletedAt: mongoose.trusted({ $ne: null }),
    },
    {
      $set: {
        deletedAt: null,
        items: [],
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (deletedCart) {
    return deletedCart;
  }

  return Cart.create({
    buyer: buyerId,
    items: [],
  });
}

async function getCart(buyerId) {
  const cart = await Cart.findOne({
    buyer: buyerId,
    deletedAt: null,
  }).lean();

  if (!cart) {
    return emptyCart(buyerId);
  }

  const listingIds = cart.items.map((item) => item.listing);

  const listings = await Listing.find({
    _id: mongoose.trusted({ $in: listingIds }),
    deletedAt: null,
  })
    .populate({
      path: 'book',
      select: 'title author coverImageUrl markedUnavailable deletedAt',
      match: { deletedAt: null },
    })
    .populate('seller', 'name')
    .lean();

  const listingMap = new Map(
    listings.map((listing) => [String(listing._id), listing]),
  );

  const items = cart.items.map((item) => {
    const listing = listingMap.get(String(item.listing));

    const available =
      Boolean(listing) &&
      listing.status === LISTING_STATUS.ACTIVE &&
      listing.quantity >= 1 &&
      Boolean(listing.book) &&
      !listing.book.markedUnavailable;

    return {
      listing: String(item.listing),
      quantity: item.quantity,
      available,
      listingDetails: listing
        ? {
            id: String(listing._id),
            price: listing.price,
            stock: listing.quantity,
            condition: listing.condition,
            book: listing.book,
            seller: listing.seller,
          }
        : null,
      lineTotal:
        available && listing
          ? Number((listing.price * item.quantity).toFixed(2))
          : 0,
    };
  });

  const itemCount = items.reduce(
    (total, item) => total + item.quantity,
    0,
  );

  const subtotal = Number(
    items
      .filter((item) => item.available)
      .reduce((total, item) => total + item.lineTotal, 0)
      .toFixed(2),
  );

  return {
    buyer: String(buyerId),
    items,
    itemCount,
    subtotal,
  };
}

async function addItem(buyerId, listingId, quantity = 1) {
  if (!validateQuantity(quantity)) {
    throw invalidQuantityError();
  }

  const listing = await getActiveListing(listingId);
  const cart = await getOrCreateCart(buyerId);

  const existingItem = cart.items.find(
    (item) => String(item.listing) === String(listing._id),
  );

  const newQuantity = existingItem
    ? existingItem.quantity + quantity
    : quantity;

  if (newQuantity > listing.quantity) {
    throw exceedsStockError(listing);
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

  return getCart(buyerId);
}

async function updateItem(buyerId, listingId, quantity) {
  if (!validateId(listingId)) {
    throw new AppError(404, strings.common.notFound);
  }

  if (!validateQuantity(quantity)) {
    throw invalidQuantityError();
  }

  const listing = await getActiveListing(listingId);

  if (quantity > listing.quantity) {
    throw exceedsStockError(listing);
  }

  const cart = await Cart.findOne({
    buyer: buyerId,
    deletedAt: null,
  });

  if (!cart) {
    throw new AppError(404, strings.common.notFound);
  }

  const item = cart.items.find(
    (entry) => String(entry.listing) === String(listingId),
  );

  if (!item) {
    throw new AppError(404, strings.common.notFound);
  }

  item.quantity = quantity;

  await cart.save();

  return getCart(buyerId);
}

async function removeItem(buyerId, listingId) {
  if (!validateId(listingId)) {
    throw new AppError(404, strings.common.notFound);
  }

  const cart = await Cart.findOne({
    buyer: buyerId,
    deletedAt: null,
  });

  if (!cart) {
    throw new AppError(404, strings.common.notFound);
  }

  const originalLength = cart.items.length;

  cart.items = cart.items.filter(
    (item) => String(item.listing) !== String(listingId),
  );

  if (cart.items.length === originalLength) {
    throw new AppError(404, strings.common.notFound);
  }

  await cart.save();

  return getCart(buyerId);
}

async function clearCart(buyerId) {
  const cart = await Cart.findOne({
    buyer: buyerId,
    deletedAt: null,
  });

  if (!cart) {
    return emptyCart(buyerId);
  }

  cart.items = [];
  await cart.save();

  return getCart(buyerId);
}

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
};
