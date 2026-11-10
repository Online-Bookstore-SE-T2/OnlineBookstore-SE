const { config, assertServerConfig } = require('../config/env');
const { connectDatabase, disconnectDatabase } = require('../config/db');
const Book = require('../models/Book');
const { buildBookSearchIndex } = require('../utils/bookSearchIndex');

const BATCH_SIZE = 500;

async function backfillBookSearchIndex() {
  assertServerConfig();
  await connectDatabase(config.mongoUri);

  let operations = [];
  let processed = 0;
  let modified = 0;

  try {
    const cursor = Book.find({})
      .select('title author isbn')
      .lean()
      .cursor();

    async function flushBatch() {
      if (operations.length === 0) return;

      const result = await Book.bulkWrite(operations, { ordered: false });
      modified += result.modifiedCount;
      operations = [];
    }

    for await (const book of cursor) {
      operations.push({
        updateOne: {
          filter: { _id: book._id },
          update: { $set: buildBookSearchIndex(book) },
        },
      });

      processed++;

      if (operations.length >= BATCH_SIZE) {
        await flushBatch();
      }
    }

    await flushBatch();

    await Book.collection.createIndex(
      { searchNgrams: 1 },
      { name: 'searchNgrams_1' },
    );

    console.log('\n===== SEARCH INDEX BACKFILL =====');
    console.log(`Books processed: ${processed}`);
    console.log(`Books updated: ${modified}`);
    console.log('=================================\n');
  } finally {
    await disconnectDatabase();
  }
}

backfillBookSearchIndex().catch((error) => {
  console.error('Search index backfill failed:', error);
  process.exitCode = 1;
});
