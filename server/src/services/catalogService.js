const mongoose = require('mongoose');
const { Book, Listing, Category } = require('../models');
const { LISTING_STATUS } = require('../constants');
const { ValidationError } = require('../utils/errors');

const PAGE_SIZE = 20;

const SORT_OPTIONS = {
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: 1 },
  rating_desc: { averageRating: -1, _id: 1 },
  title_asc: { title: 1, _id: 1 },
  title_desc: { title: -1, _id: 1 },
  newest: { createdAt: -1, _id: 1 },
};

function parseNumber(value, name) {
  if (value === undefined || value === '') {
    return undefined;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new ValidationError(`${name} must be a valid number.`);
  }

  return number;
}

function parsePage(value) {
  if (value === undefined || value === '') {
    return 1;
  }

  const page = Number(value);

  if (!Number.isInteger(page) || page < 1) {
    throw new ValidationError('Page must be a positive integer.');
  }

  return page;
}

async function getCatalogBooks(query = {}) {
  const {
    category,
    minPrice,
    maxPrice,
    minRating,
    available,
    sort = 'title_asc',
  } = query;

  const page = parsePage(query.page);

  if (!Object.prototype.hasOwnProperty.call(SORT_OPTIONS, sort)) {
    throw new ValidationError('Invalid sort option.');
  }

  const minimumPrice = parseNumber(minPrice, 'Minimum price');
  const maximumPrice = parseNumber(maxPrice, 'Maximum price');
  const rating = parseNumber(minRating, 'Minimum rating');

  if (minimumPrice !== undefined && minimumPrice < 0) {
    throw new ValidationError('Minimum price cannot be negative.');
  }

  if (maximumPrice !== undefined && maximumPrice < 0) {
    throw new ValidationError('Maximum price cannot be negative.');
  }

  if (
    minimumPrice !== undefined &&
    maximumPrice !== undefined &&
    minimumPrice > maximumPrice
  ) {
    throw new ValidationError(
      'Minimum price cannot be greater than maximum price.'
    );
  }

  if (rating !== undefined && (rating < 0 || rating > 5)) {
    throw new ValidationError(
      'Minimum rating must be between 0 and 5.'
    );
  }

  if (
    available !== undefined &&
    !['true', 'false'].includes(available)
  ) {
    throw new ValidationError(
      'Available must be true or false.'
    );
  }

  const filter = { deletedAt: null };

  // Category filter
  if (category) {
    if (!mongoose.isValidObjectId(category)) {
      throw new ValidationError('Invalid category ID.');
    }

    filter.category = category;
  }

  // Price range filter
  if (
    minimumPrice !== undefined ||
    maximumPrice !== undefined
  ) {
    filter.price = {};

    if (minimumPrice !== undefined) {
      filter.price.$gte = minimumPrice;
    }

    if (maximumPrice !== undefined) {
      filter.price.$lte = maximumPrice;
    }
  }

  // Minimum rating filter
  if (rating !== undefined) {
    filter.averageRating = { $gte: rating };
  }

  // Availability filter
  if (available !== undefined) {
    const inStockBookIds = await Listing.distinct('book', {
      status: LISTING_STATUS.ACTIVE,
      deletedAt: null,
      quantity: { $gt: 0 },
    });

    if (available === 'true') {
      filter.markedUnavailable = false;
      filter._id = { $in: inStockBookIds };
    } else {
      filter.$or = [
        { markedUnavailable: true },
        { _id: { $nin: inStockBookIds } },
      ];
    }
  }

  const skip = (page - 1) * PAGE_SIZE;

  const [items, total] = await Promise.all([
    Book.find(filter)
      .populate('category', 'name')
      .sort(SORT_OPTIONS[sort])
      .skip(skip)
      .limit(PAGE_SIZE)
      .lean(),

    Book.countDocuments(filter),
  ]);

  return {
    items,
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}

// Fetch active categories for the catalog dropdown
async function getCatalogCategories() {
  return Category.find({ deletedAt: null })
    .select('_id name')
    .sort({ name: 1 })
    .lean();
}

module.exports = {
  PAGE_SIZE,
  SORT_OPTIONS,
  getCatalogBooks,
  getCatalogCategories,
};