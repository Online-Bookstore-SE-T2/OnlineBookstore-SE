const { Book, Category } = require('../models');
const { getSearchTrigrams } = require('../utils/bookSearchIndex');
const { createInFlightCoalescer } = require('../utils/inFlight');

const coalesceSearch = createInFlightCoalescer();
const PAGE_SIZE = 20;

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pageNumber(value) {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

// Match the existing Mongoose toJSONPlugin response shape.
function transformCategory(category) {
  if (!category) return category;

  const { _id, ...fields } = category;
  delete fields.__v;

  return {
    ...fields,
    id: _id.toString(),
  };
}

function transformBook(book) {
  const { _id, category, ...fields } = book;
  delete fields.__v;
  delete fields.searchNgrams;

  return {
    ...fields,
    category: transformCategory(category),
    id: _id.toString(),
  };
}
async function executeSearchBooks(query = {}) {
  const page = pageNumber(query.page);

  const searchText =
    typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';

  const filter = {
    deletedAt: null,
    markedUnavailable: false,
  };

  // Preserve the existing indexed find + count path for an empty query.
  if (searchText === '') {
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

  const pattern = new RegExp(escapeRegex(searchText), 'i');

  const exactSearchFilter = {
    $or: [
      { title: pattern },
      { author: pattern },
      { isbn: pattern },
    ],
  };

  // Use indexed trigrams for ASCII queries of at least three characters.
  // Short and non-ASCII queries retain the original regex-only search path.
  const trigrams = getSearchTrigrams(searchText);

  const candidateFilter = trigrams
    ? { ...filter, searchNgrams: { $all: trigrams } }
    : filter;

  const skip = (page - 1) * PAGE_SIZE;

  // Narrow candidates first, then preserve exact substring matching.
  // The facet still returns the page and exact total in one aggregation.
  const [result] = await Book.aggregate([
    { $match: candidateFilter },
    { $match: exactSearchFilter },
    { $project: { searchNgrams: 0 } },
    {
      $facet: {
        items: [
          { $sort: { title: 1, _id: 1 } },
          { $skip: skip },
          { $limit: PAGE_SIZE },
          {
            $lookup: {
              from: Category.collection.name,
              localField: 'category',
              foreignField: '_id',
              pipeline: [{ $project: { name: 1 } }],
              as: 'category',
            },
          },
          {
            $unwind: {
              path: '$category',
              preserveNullAndEmptyArrays: true,
            },
          },
        ],
        metadata: [{ $count: 'total' }],
      },
    },
    {
      $project: {
        items: 1,
        total: {
          $ifNull: [{ $arrayElemAt: ['$metadata.total', 0] }, 0],
        },
      },
    },
  ]);

  const total = result?.total || 0;

  return {
    items: (result?.items || []).map(transformBook),
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

function searchQueryKey(query = {}) {
  return JSON.stringify(
    Object.entries(query || {}).sort(([left], [right]) => left.localeCompare(right)),
  );
}

// Share only an identical search while its database operation is pending.
// No completed response is retained, so later requests always read fresh data.
function searchBooks(query = {}) {
  return coalesceSearch(
    searchQueryKey(query),
    () => executeSearchBooks(query),
  );
}

module.exports = {
  PAGE_SIZE,
  searchBooks,
};
