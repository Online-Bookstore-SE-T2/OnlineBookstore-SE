
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

const { createCatalogRouter } = require('./routes/catalogRoutes');
const { createBookRouter } = require('./routes/bookRoutes');

const { createCartRouter } = require('./routes/cartRoutes');
const { createCheckoutRouter } = require('./routes/checkoutRoutes');
const { createPaymentRouter } = require('./routes/paymentRoutes');
const { createOrderRouter } = require('./routes/orderRoutes');
const { createNotificationRouter } = require('./routes/notificationRoutes');

const {
    createBookMarketplaceRouter,
    createSellerListingRouter
} = require('./routes/marketplaceRoutes');

// Builds the Express application. `authRateLimit` lets tests tune the authentication rate limiter.
function createApp({
    authRateLimit,
    logRequests = config.env !== 'test'
} = {}) {
    const app = express();

    app.disable('x-powered-by');

    if (config.env === 'production') {
        app.set('trust proxy', 1);
        app.use(enforceHttps);
    }

    app.use(helmet());

    // Restrict cross-origin requests to the configured client origin.
    app.use(
        cors({
            origin: (origin, callback) => {
                callback(null, origin === config.clientOrigin);
            }
        })
    );

    app.use(express.json({ limit: config.bodyLimit }));
    app.use(sanitizeRequest);

    if (logRequests) {
        app.use(requestLogger);
    }

    // Health check
    app.get('/api/health', (_req, res) => {
        res.json({ status: 'ok' });
    });

    // Authentication, users and administration
    app.use('/api/auth', createAuthRouter({ rateLimit: authRateLimit }));
    app.use('/api/users', createUserRouter());
    app.use('/api/admin', createAdminRouter());

    // Cart, checkout, payments, orders and notifications
    app.use('/api/cart', createCartRouter());
    app.use('/api/checkout', createCheckoutRouter());
    app.use('/api/payments', createPaymentRouter());
    app.use('/api/orders', createOrderRouter());
    app.use('/api/notifications', createNotificationRouter());

    // Book marketplace and seller listings
    app.use('/api/books', createBookMarketplaceRouter());
    app.use('/api/listings', createSellerListingRouter());

    // OSP-7: catalog listing, filtering and sorting
    app.use('/api/books', createCatalogRouter());

    // OSP-7: book search
    app.use('/api/books', createBookRouter());

    // Handle unmatched requests and application errors
    app.use(notFound);
    app.use(errorHandler);

    return app;
}

module.exports = { createApp };
