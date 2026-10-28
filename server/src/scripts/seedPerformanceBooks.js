const { config, assertServerConfig } = require('../config/env');
const { connectDatabase, disconnectDatabase } = require('../config/db');
const Book = require('../models/Book');
const Category = require('../models/Category');

const TARGET_COUNT = 5000;
const FIRST_NUMBER = 100001;

const CATEGORIES = [
  'Technology',
  'Self-Help',
  'Business',
  'Fiction',
  'Science',
  'Mathematics',
  'Biography',
  'Education',
  'History',
  'Health',
];

const AUTHORS = [
  'Aarav Sharma',
  'Priya Rao',
  'Daniel Brooks',
  'Emily Carter',
  'Michael Reed',
  'Sophia Turner',
  'Ananya Iyer',
  'Rahul Mehta',
  'Olivia Bennett',
  'Thomas Mitchell',
];

const TOPICS = [
  'Foundations',
  'Practical Guide',
  'Essential Concepts',
  'Modern Perspectives',
  'A Complete Introduction',
  'Advanced Methods',
  'Learning Through Examples',
  'Research and Applications',
  'Principles and Practice',
  'A Student Handbook',
];

function makeIsbn13(number) {
  const base = `978${String(number).padStart(9, '0')}`;
  const digits = [...base].map(Number);

  const sum = digits.reduce(
    (total, digit, index) =>
      total + digit * (index % 2 === 0 ? 1 : 3),
    0,
  );

  return base + String((10 - (sum % 10)) % 10);
}

function makeBook(number, categoryId) {
  const categoryIndex = number % CATEGORIES.length;
  const topicIndex = Math.floor(number / CATEGORIES.length) % TOPICS.length;
  const authorIndex = number % AUTHORS.length;

  return {
    isbn: makeIsbn13(number),
    title: `${CATEGORIES[categoryIndex]}: ${TOPICS[topicIndex]} Volume ${number}`,
    author: AUTHORS[authorIndex],
    description:
      `Synthetic performance-test book record ${number}. ` +
      `Category: ${CATEGORIES[categoryIndex]}.`,
    category: categoryId,
    price: Number((99 + (number % 90000) / 100).toFixed(2)),
    markedUnavailable: false,
    averageRating: Number((1 + (number % 41) / 10).toFixed(1)),
    reviewCount: number % 250,
  };
}

async function seedPerformanceBooks() {
  assertServerConfig();

  await connectDatabase(config.mongoUri);

  try {
    const categoryIds = new Map();

    for (const name of CATEGORIES) {
      const category = await Category.findOne({ name })
        .collation({ locale: 'en', strength: 2 });

      if (!category) {
        throw new Error(
          `Category "${name}" is missing. Run the existing demo seeder first.`,
        );
      }

      if (category.deletedAt) {
        throw new Error(`Category "${name}" is soft-deleted.`);
      }

      categoryIds.set(name, category._id);
    }

    const operations = [];

    for (let offset = 0; offset < TARGET_COUNT; offset++) {
      const number = FIRST_NUMBER + offset;
      const categoryName = CATEGORIES[number % CATEGORIES.length];
      const book = makeBook(number, categoryIds.get(categoryName));

      operations.push({
        updateOne: {
          filter: { isbn: book.isbn },
          update: { $setOnInsert: book },
          upsert: true,
        },
      });
    }

    const result = await Book.bulkWrite(operations, { ordered: true });

    console.log('\n===== PERFORMANCE DATASET SUMMARY =====');
    console.log(`Target synthetic records: ${TARGET_COUNT}`);
    console.log(`New records inserted: ${result.upsertedCount}`);
    console.log(`Existing ISBNs skipped: ${TARGET_COUNT - result.upsertedCount}`);
    console.log(`Categories reused: ${CATEGORIES.length}`);
    console.log('========================================\n');
  } finally {
    await disconnectDatabase();
  }
}

seedPerformanceBooks().catch((error) => {
  console.error('Performance seeding failed:', error.message);
  process.exitCode = 1;
});
