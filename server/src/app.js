const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');

const { config } = require('./config/env');
const { sanitizeRequest } = require('./middleware/sanitize');
const { requestId } = require('./middleware/requestId');
const { requestLogger } = require('./middleware/requestLogger');
const { enforceHttps } = require('./middleware/https');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { monitor } = require('./monitoring/monitor');
const { createMetricsRouter, readiness } = require('./routes/monitoringRoutes');

const { createAuthRouter } = require('./routes/authRoutes');
const { createUserRouter } = require('./routes/userRoutes');
const { createAdminRouter } = require('./routes/adminRoutes');
const { createCatalogRouter } = require('./routes/catalogRoutes');
const { createBookRouter } = require('./routes/bookRoutes');
const { createCartRouter } = require('./routes/cartRoutes');
const { createCheckoutRouter } = require('./routes/checkoutRoutes');
const { createPaymentRouter } = require('./routes/paymentRoutes');
const { createOrderRouter } = require('./routes/orderRoutes');
const { createNotificationRouter } = require('./routes/notificationRoutes');

const {
  createBookMarketplaceRouter,
  createSellerListingRouter,
} = require('./routes/marketplaceRoutes');

// Builds the Express application. Tests can configure the authentication rate limiter.
function createApp({
  authRateLimit,
  // Avoid per-request console I/O in development.
  // Production logging remains enabled by default; LOG_REQUESTS can override it.
  logRequests =
    process.env.LOG_REQUESTS === 'true'
    || (process.env.LOG_REQUESTS !== 'false' && config.env === 'production'),
} = {}) {
  const app = express();

  app.disable('x-powered-by');

  // First, so every response, including an HTTPS refusal, carries its correlation id (SASD 4.4.2).
  app.use(requestId);
  // SASD 4.4.3: response status and timing feed the monitoring metrics.
  app.use(monitor.middleware());

  if (config.env === 'production') {
    app.set('trust proxy', 1);
    app.use(enforceHttps);
  }

  // Razorpay Checkout loads its script from checkout.razorpay.com and opens its form in an
  // iframe from api.razorpay.com; netbanking and some card checks open a pop-up window.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
        frameSrc: ["'self'", 'https://api.razorpay.com'],
        connectSrc: ["'self'", 'https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
        imgSrc: ["'self'", 'data:', 'https://cdn.razorpay.com'],
      },
    },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  }));

  // Restrict cross-origin requests to the configured client origin.
  app.use(
    cors({
      origin: (origin, callback) => {
        callback(null, origin === config.clientOrigin);
      },
    })
  );

  app.use(express.json({ limit: config.bodyLimit }));
  app.use(sanitizeRequest);

  if (logRequests) {
    app.use(requestLogger);
  }

  // Health check.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/api/health/ready', readiness);
  app.use('/api/metrics', createMetricsRouter());

  // Authentication, users, and administration.
  app.use('/api/auth', createAuthRouter({ rateLimit: authRateLimit }));
  app.use('/api/users', createUserRouter());
  app.use('/api/admin', createAdminRouter());

  // Catalog and search routes must be registered before marketplace routes
  // that may handle parameterized book paths.
  app.use('/api/books', createCatalogRouter());
  app.use('/api/books', createBookRouter());
  app.use('/api/books', createBookMarketplaceRouter());

  // Shopping cart and checkout workflow.
  app.use('/api/cart', createCartRouter());
  app.use('/api/checkout', createCheckoutRouter());
  app.use('/api/payments', createPaymentRouter());
  app.use('/api/orders', createOrderRouter());

  // Notifications and seller listings.
  app.use('/api/notifications', createNotificationRouter());
  app.use('/api/listings', createSellerListingRouter());

  if (config.env === 'production') {
    const clientBuildPath = path.resolve(__dirname, '../../client/dist');
    app.use(express.static(clientBuildPath, { index: false }));
    app.get('*', (req, res, next) => {
      if (req.path === '/api' || req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(clientBuildPath, 'index.html'), (error) => {
        if (error) next(error);
      });
    });
  }

  // Handle unmatched requests and application errors.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };