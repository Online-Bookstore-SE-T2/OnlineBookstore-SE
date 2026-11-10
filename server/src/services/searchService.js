const { Book, Category } = require('../models');

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

  return {
    ...fields,
    category: transformCategory(category),
    id: _id.toString(),
  };
}
async function searchBooks(query = {}) {
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

  filter.$or = [
    { title: pattern },
    { author: pattern },
    { isbn: pattern },
  ];

  const skip = (page - 1) * PAGE_SIZE;

  // Retrieve the page and exact result count in one aggregation.
  const [result] = await Book.aggregate([
    { $match: filter },
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

module.exports = {
  PAGE_SIZE,
  searchBooks,
};
