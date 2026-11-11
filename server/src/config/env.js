const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const MIN_BCRYPT_ROUNDS = 10;

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI,
  mongoMaxPoolSize: Math.max(
    1,
    Number.parseInt(process.env.MONGODB_MAX_POOL_SIZE || '100', 10) || 100
  ),
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
  paymentProvider: process.env.PAYMENT_PROVIDER || 'simulator',
  // Razorpay test-mode keys (Dashboard → Test Mode → API Keys). The key id is public; the secret stays on the server.
  razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
  // SASD 4.4.3: optional address that receives monitoring alerts by e-mail.
  alertEmail: process.env.ALERT_EMAIL,
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  },
};

function assertServerConfig() {
  const missing = ['mongoUri', 'jwtSecret'].filter((key) => !config[key]);
  if (!['simulator', 'razorpay'].includes(config.paymentProvider)) {
    missing.push('PAYMENT_PROVIDER must be simulator or razorpay');
  }
  if (config.env === 'production' && config.paymentProvider !== 'razorpay') {
    missing.push('PAYMENT_PROVIDER=razorpay');
  }
  if (config.paymentProvider === 'razorpay') {
    if (!config.razorpayKeyId) missing.push('RAZORPAY_KEY_ID');
    if (!config.razorpayKeySecret) missing.push('RAZORPAY_KEY_SECRET');
  }
  if (missing.length > 0) {
    throw new Error(`Missing required environment configuration: ${missing.join(', ')}`);
  }
}

module.exports = { config, assertServerConfig, MIN_BCRYPT_ROUNDS };
