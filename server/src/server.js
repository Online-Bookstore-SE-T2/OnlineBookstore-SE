const { config, assertServerConfig } = require('./config/env');
const { connectDatabase } = require('./config/db');
require('./models');
const { createApp } = require('./app');

async function start() {
  assertServerConfig();
  await connectDatabase(config.mongoUri);
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`API listening on port ${config.port} (${config.env})`);
  });
}

start().catch((err) => {
  console.error(`Failed to start server: ${err.name}`);
  process.exit(1);
});
