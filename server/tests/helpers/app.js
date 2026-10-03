const { createApp } = require('../../src/app');

// Application under test. The auth rate limit is raised so ordinary tests are not throttled;
// the rate-limit tests build their own app with the real limit.
function testApp(options = {}) {
  return createApp({ authRateLimit: { limit: 10000 }, ...options });
}

module.exports = { testApp };
