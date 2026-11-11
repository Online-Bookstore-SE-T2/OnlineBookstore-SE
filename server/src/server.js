const { config, assertServerConfig } = require('./config/env');
const { connectDatabase } = require('./config/db');
require('./models');
const { createApp } = require('./app');
const { monitor } = require('./monitoring/monitor');
const { sendOperationalAlert } = require('./services/emailService');

async function start() {
  assertServerConfig();
  const connection = await connectDatabase(config.mongoUri, {
    maxPoolSize: config.mongoMaxPoolSize,
  });
  // SASD 4.4.3: watch the connection pool and check the alert thresholds every 30 seconds.
  monitor.instrumentPool(connection.getClient());
  monitor.start({
    notify: (result, summary) => sendOperationalAlert(`[Online Bookstore] Alert: ${result.id}`, summary),
  });
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`API listening on port ${config.port} (${config.env})`);
  });
}

start().catch((err) => {
  console.error(`Failed to start server: ${err.name}`);
  process.exit(1);
});
