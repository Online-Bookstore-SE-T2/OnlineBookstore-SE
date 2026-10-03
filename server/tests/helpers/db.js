const mongoose = require('mongoose');
const { config } = require('../../src/config/env');
const { connectDatabase, disconnectDatabase } = require('../../src/config/db');
require('../../src/models');

async function connect() {
  await connectDatabase(config.mongoUri);
}

async function clear() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

async function close() {
  await mongoose.connection.db.dropDatabase();
  await disconnectDatabase();
}

// Registers the usual connect / clear / drop lifecycle for a test file.
function useTestDatabase() {
  beforeAll(connect);
  beforeEach(clear);
  afterAll(close);
}

module.exports = { connect, clear, close, useTestDatabase };
