const mongoose = require('mongoose');
const { Book, Listing } = require('../models');
const { LISTING_STATUS } = require('../constants');
const { ValidationError } = require('../utils/errors');

const PAGE_SIZE = 20;

const SORT_OPTIONS = {
  price_asc: { price: 1, title: 1, _id: 1 },
  price_desc: { price: -1, title: 1, _id: 1 },
  rating_desc: { averageRating: -1, title: 1, _id: 1 },
  title_asc: { title: 1, _id: 1 },
  title_desc: { title: -1, _id: -1 },
  newest: { createdAt: -1, _id: -1 },
};

function parseNumber(value, field, { min = 0, max = Infinity } = {}) {
  if (value === undefined || value === '') return undefined;

  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number < min ||
    number > max
  ) {
    throw new ValidationError({
      [field]: `${field} must be a number between ${min} and ${max === Infinity ? 'a valid maximum' : max}.`,
    });
  }

  return number;
}

function parseBoolean(value, field) {
  if (value === undefined || value === '') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;

  throw new ValidationError({
    [field]: `${field} must be true or false.`,
  });
}

async function getCatalogBooks(query = {}) {
  const filter = { deletedAt: null };

  if (query.category !== undefined && query.category !== '') {
    if (!mongoose.isValidObjectId(query.category)) {
      throw new ValidationError({
        category: 'category must be a valid category ID.',
      });
    }

    filter.category = query.category;
  }

  const minPrice = parseNumber(query.minPrice, 'minPrice');
  const maxPrice = parseNumber(query.maxPrice, 'maxPrice');
  const minRating = parseNumber(query.minRating, 'minRating', {
    min: 0,
    max: 5,
  });
  const available = parseBoolean(query.available, 'available');

  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new ValidationError({
      minPrice: 'minPrice cannot be greater than maxPrice.',
    });
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};
    if (minPrice !== undefined) filter.price.$gte = minPrice;
    if (maxPrice !== undefined) filter.price.$lte = maxPrice;
  }

  if (minRating !== undefined) {
    filter.averageRating = { $gte: minRating };
  }

  if (available !== undefined) {
    const inStockBookIds = await Listing.distinct('book', {
      status: LISTING_STATUS.ACTIVE,
      deletedAt: null,
      quantity: { $gt: 0 },
    });

    if (available) {
      filter.markedUnavailable = false;
      filter._id = { $in: inStockBookIds };
    } else {
      filter.$or = [
        { markedUnavailable: true },
        { _id: { $nin: inStockBookIds } },
      ];
    }
  }

  const sortName = query.sort || 'title_asc';

  if (!Object.prototype.hasOwnProperty.call(SORT_OPTIONS, sortName)) {
    throw new ValidationError({
      sort: `sort must be one of: ${Object.keys(SORT_OPTIONS).join(', ')}.`,
    });
  }

  const requestedPage = query.page === undefined ? 1 : Number(query.page);

  if (!Number.isInteger(requestedPage) || requestedPage < 1) {
    throw new ValidationError({
      page: 'page must be a positive integer.',
    });
  }

  const skip = (requestedPage - 1) * PAGE_SIZE;

  const [items, total] = await Promise.all([
    Book.find(filter)
      .populate('category', 'name')
      .sort(SORT_OPTIONS[sortName])
      .skip(skip)
      .limit(PAGE_SIZE),

    Book.countDocuments(filter),
  ]);

  return {
    items,
    page: requestedPage,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}

module.exports = {
  PAGE_SIZE,
  SORT_OPTIONS,
  getCatalogBooks,
};
