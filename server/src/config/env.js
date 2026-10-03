const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const MIN_BCRYPT_ROUNDS = 10;

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  // REQ-2 / SRS 3.3: tokens expire 24 hours after issue
  jwtExpiresInSeconds: 24 * 60 * 60,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  // SRS 6.3: work factor of at least 10
  bcryptRounds: Math.max(MIN_BCRYPT_ROUNDS, Number(process.env.BCRYPT_ROUNDS) || 12),
  // SRS 3.3: request bodies limited to 1 MB
  bodyLimit: '1mb',
  // SRS 6.3: authentication endpoints limited to 10 requests per minute per IP
  authRateLimit: { windowMs: 60 * 1000, limit: 10 },
  // REQ-2: five consecutive failures lock the account for 15 minutes
  lockout: { maxAttempts: 5, durationMs: 15 * 60 * 1000 },
  // SRS 6.2: soft-deleted records are retained for 30 days
  softDeleteRetentionSeconds: 30 * 24 * 60 * 60,
  // REQ-3: at most five delivery addresses per user
  maxAddresses: 5,
  admin: {
    name: process.env.ADMIN_NAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  },
};

function assertServerConfig() {
  const missing = ['mongoUri', 'jwtSecret'].filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment configuration: ${missing.join(', ')}`);
  }
}

module.exports = { config, assertServerConfig, MIN_BCRYPT_ROUNDS };
