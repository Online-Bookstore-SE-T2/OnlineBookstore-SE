const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { config } = require('./config/env');
const { sanitizeRequest } = require('./middleware/sanitize');
const { requestLogger } = require('./middleware/requestLogger');
const { enforceHttps } = require('./middleware/https');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const { createAuthRouter } = require('./routes/authRoutes');
const { createUserRouter } = require('./routes/userRoutes');
const { createAdminRouter } = require('./routes/adminRoutes');
const { createBookRouter } = require('./routes/bookRoutes');
const { createCatalogRouter } = require('./routes/catalogRoutes');
const { createCartRouter } = require('./routes/cartRoutes');
const { createCheckoutRouter } = require('./routes/checkoutRoutes');
const { createPaymentRouter } = require('./routes/paymentRoutes');
const { createOrderRouter } = require('./routes/orderRoutes');
const { createNotificationRouter } = require('./routes/notificationRoutes');
const {
  createBookMarketplaceRouter,
  createSellerListingRouter,
} = require('./routes/marketplaceRoutes');

function createApp({ authRateLimit, logRequests = config.env !== 'test' } = {}) {
  const app = express();
  app.disable('x-powered-by');

  if (config.env === 'production') {
    app.set('trust proxy', 1);
    app.use(enforceHttps);
  }

  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => callback(null, origin === config.clientOrigin),
  }));
  app.use(express.json({ limit: config.bodyLimit }));
  app.use(sanitizeRequest);

  if (logRequests) app.use(requestLogger);

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', createAuthRouter({ rateLimit: authRateLimit }));
  app.use('/api/users', createUserRouter());
  app.use('/api/admin', createAdminRouter());

  // Catalog routes must precede the parameterized book-details route.
  app.use('/api/books', createCatalogRouter());
  app.use('/api/books', createBookRouter());
  app.use('/api/books', createBookMarketplaceRouter());

  // Shopping cart and checkout workflow.
  app.use('/api/cart', createCartRouter());
  app.use('/api/checkout', createCheckoutRouter());
  app.use('/api/payments', createPaymentRouter());
  app.use('/api/orders', createOrderRouter());

  // Notifications and seller marketplace.
  app.use('/api/notifications', createNotificationRouter());
  app.use('/api/listings', createSellerListingRouter());

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
