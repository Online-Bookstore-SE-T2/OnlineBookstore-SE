// Replace historical seeded rating placeholders with values from real reviews.
// RATING_BACKUP_PATH must point outside the repository so the old values can be restored.
const fs = require('fs');
const { config, assertServerConfig } = require('../config/env');
const { connectDatabase, disconnectDatabase } = require('../config/db');
const Book = require('../models/Book');
const { recomputeBookRating } = require('../services/ratingService');

async function main() {
  assertServerConfig();
  const backupPath = process.env.RATING_BACKUP_PATH;
  if (!backupPath) throw new Error('RATING_BACKUP_PATH is required.');

  await connectDatabase(config.mongoUri);
  try {
    const books = await Book.find({
      description: /sample bookstore listing created for testing the catalogue/,
      deletedAt: null,
    })
      .select('_id title averageRating reviewCount')
      .lean();
    if (books.length === 0 || books.length > 100) {
      throw new Error(`Expected 1–100 seeded sample books; found ${books.length}.`);
    }

    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, JSON.stringify(books, null, 2), { flag: 'wx', mode: 0o600 });
    }

    let changed = 0;
    for (const book of books) {
      const rating = await recomputeBookRating(book._id);
      if (rating.averageRating !== book.averageRating || rating.reviewCount !== book.reviewCount) {
        changed++;
      }
    }
    console.log(`Reconciled ${books.length} sample books; changed ${changed} ratings.`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
