const mongoose = require('mongoose');

// Strip query operators ($ne, $gt, ...) from filters built from user input (SRS 6.3).
mongoose.set('sanitizeFilter', true);
mongoose.set('strictQuery', true);

async function connectDatabase(uri) {
  await mongoose.connect(uri);
  // Build unique and TTL indexes before serving requests so the constraints hold from the start.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  return mongoose.connection;
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase };
