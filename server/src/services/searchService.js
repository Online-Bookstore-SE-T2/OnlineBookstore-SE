const { Book } = require('../models');

const PAGE_SIZE = 20;

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pageNumber(value) {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

async function searchBooks(query = {}) {
  const page = pageNumber(query.page);

  const searchText =
    typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';

  const filter = {
    deletedAt: null,
    markedUnavailable: false,
  };

  if (searchText !== '') {
    const pattern = escapeRegex(searchText);

    filter.$or = [
      { title: { $regex: pattern, $options: 'i' } },
      { author: { $regex: pattern, $options: 'i' } },
      { isbn: { $regex: pattern, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * PAGE_SIZE;

  const [items, total] = await Promise.all([
    Book.find(filter)
      .populate('category', 'name')
      .sort({ title: 1, _id: 1 })
      .skip(skip)
      .limit(PAGE_SIZE),

    Book.countDocuments(filter),
  ]);

  return {
    items,
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

module.exports = {
  PAGE_SIZE,
  searchBooks,
};