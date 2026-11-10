// SASD 4.4.3 monitoring: what is measured, the alert thresholds, and the alert loop.
// See docs/monitoring.md for how each metric is collected and what is left out.
const os = require('os');
const mongoose = require('mongoose');
const { createMetricsStore } = require('./metrics');

const MINUTE = 60 * 1000;

// Every metric is evaluated over the window its SASD threshold names. `minSamples` stops a
// single slow request or failed checkout from raising an alert on an idle service.
const DEFINITIONS = [
  { id: 'checkoutFailureRate', unit: 'ratio', threshold: 0.1, windowMinutes: 15, minSamples: 5 },
  { id: 'orderCommitAbortRate', unit: 'ratio', threshold: 0.02, windowMinutes: 15, minSamples: 5 },
  { id: 'searchResponseP95', unit: 'ms', threshold: 2000, windowMinutes: 15, minSamples: 10 },
  { id: 'pageLoadP95', unit: 'ms', threshold: 3000, windowMinutes: 15, minSamples: 10 },
  { id: 'api5xxRate', unit: 'ratio', threshold: 0.01, windowMinutes: 15, minSamples: 20 },
  { id: 'failedLoginsPerMinute', unit: 'count', threshold: 20, windowMinutes: 1, minSamples: 0 },
  { id: 'emailPermanentFailures', unit: 'count', threshold: 0, windowMinutes: 15, minSamples: 0 },
  { id: 'dbPoolUtilisation', unit: 'ratio', threshold: 0.8, windowMinutes: 5, minSamples: 0 },
  { id: 'databaseAvailability', unit: 'checks', threshold: 1, windowMinutes: 0, minSamples: 0 },
];

const SERIES = {
  requests: 'http.requests',
  errors5xx: 'http.5xx',
  searchMs: 'search.ms',
  pageLoadMs: 'pageLoad.ms',
  checkoutAttempts: 'checkout.attempts',
  checkoutFailures: 'checkout.failures',
  commitAttempts: 'orderCommit.attempts',
  commitAborts: 'orderCommit.aborts',
  commitRetries: 'orderCommit.retries',
  loginFailures: 'login.failures',
  lockouts: 'login.lockouts',
  emailFailures: 'email.permanentFailures',
};

const PAYMENT_PATH = /^\/api\/payments\/orders\/[^/]+\/(confirm|simulate)$/;

// True when the database answers a ping within the timeout.
async function pingDatabase(database = mongoose.connection, timeoutMs = 5000) {
  if (database.readyState !== 1 || !database.db) return false;
  let timer;
  try {
    await Promise.race([
      database.db.admin().ping(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('ping timed out')), timeoutMs); }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function createMonitor({ now = Date.now, store = createMetricsStore({ now }), database = mongoose.connection } = {}) {
  const pools = new Map();
  let maxPoolSize = 100;
  let poolOverSince = null;
  let failedDatabaseChecks = 0;
  let lastStatuses = new Map();
  const instance = process.env.RENDER_INSTANCE_ID || os.hostname();

  const ratio = (failures, attempts, windowMs) => {
    const total = store.count(attempts, windowMs);
    return { value: total === 0 ? null : Math.min(1, store.count(failures, windowMs) / total), samples: total };
  };
  const p95 = (series, windowMs) => ({ value: store.percentile(series, 95, windowMs), samples: store.samples(series, windowMs).length });

  function poolUtilisation() {
    const busiest = Math.max(0, ...pools.values());
    return maxPoolSize > 0 ? busiest / maxPoolSize : 0;
  }

  const measures = {
    checkoutFailureRate: (w) => ratio(SERIES.checkoutFailures, SERIES.checkoutAttempts, w),
    orderCommitAbortRate: (w) => ratio(SERIES.commitAborts, SERIES.commitAttempts, w),
    searchResponseP95: (w) => p95(SERIES.searchMs, w),
    pageLoadP95: (w) => p95(SERIES.pageLoadMs, w),
    api5xxRate: (w) => ratio(SERIES.errors5xx, SERIES.requests, w),
    failedLoginsPerMinute: (w) => ({ value: store.count(SERIES.loginFailures, w), samples: null }),
    emailPermanentFailures: (w) => ({ value: store.count(SERIES.emailFailures, w), samples: null }),
    dbPoolUtilisation: () => ({ value: poolUtilisation(), samples: null }),
    databaseAvailability: () => ({ value: failedDatabaseChecks, samples: null }),
  };

  function statusOf(definition, { value, samples }) {
    if (value === null || (samples !== null && samples < definition.minSamples)) return 'no-data';
    if (definition.id === 'dbPoolUtilisation') {
      // "Sustained": over the threshold at every check for the whole five-minute window.
      return poolOverSince !== null && now() - poolOverSince >= definition.windowMinutes * MINUTE ? 'alert' : 'ok';
    }
    return value > definition.threshold ? 'alert' : 'ok';
  }

  function evaluate() {
    return DEFINITIONS.map((definition) => {
      const measured = measures[definition.id](definition.windowMinutes * MINUTE);
      return {
        id: definition.id,
        unit: definition.unit,
        value: measured.value,
        threshold: definition.threshold,
        windowMinutes: definition.windowMinutes,
        samples: measured.samples,
        status: statusOf(definition, measured),
      };
    });
  }

  // Pings the database; two failures in a row is the SASD availability alert.
  async function checkDatabase(timeoutMs = 5000) {
    const up = await pingDatabase(database, timeoutMs);
    failedDatabaseChecks = up ? 0 : failedDatabaseChecks + 1;
    return up;
  }

  function samplePool() {
    if (poolUtilisation() > DEFINITIONS.find((d) => d.id === 'dbPoolUtilisation').threshold) {
      if (poolOverSince === null) poolOverSince = now();
    } else {
      poolOverSince = null;
    }
  }

  function format(result) {
    const value = result.unit === 'ratio' && result.value !== null ? `${(result.value * 100).toFixed(1)}%` : result.value;
    const threshold = result.unit === 'ratio' ? `${Math.round(result.threshold * 1000) / 10}%` : result.threshold;
    const window = result.windowMinutes ? ` window=${result.windowMinutes}m` : '';
    return `${result.id} value=${value} threshold=${threshold}${window} instance=${instance}`;
  }

  // One monitoring pass: sample, evaluate, and report each change into or out of alert.
  async function check({ log = console, notify } = {}) {
    await checkDatabase();
    samplePool();
    const results = evaluate();
    for (const result of results) {
      const previous = lastStatuses.get(result.id);
      if (result.status === 'alert' && previous !== 'alert') {
        log.error(`[alert] ${format(result)}`);
        if (notify) Promise.resolve(notify(result, format(result))).catch(() => {});
      } else if (previous === 'alert' && result.status !== 'alert') {
        log.warn(`[alert-resolved] ${format(result)}`);
      }
      lastStatuses.set(result.id, result.status);
    }
    return results;
  }

  return {
    store,
    definitions: DEFINITIONS,
    evaluate,
    check,
    checkDatabase,

    snapshot() {
      const items = evaluate();
      return {
        instance,
        startedAt: new Date(store.startedAt).toISOString(),
        generatedAt: new Date(now()).toISOString(),
        totals: {
          requests: store.total(SERIES.requests),
          errors5xx: store.total(SERIES.errors5xx),
          loginFailures: store.total(SERIES.loginFailures),
          lockouts: store.total(SERIES.lockouts),
          emailPermanentFailures: store.total(SERIES.emailFailures),
          orderCommitRetries: store.total(SERIES.commitRetries),
        },
        items,
        page: 1,
        totalPages: 1,
        total: items.length,
      };
    },

    // Express middleware: response status and timing for the HTTP-level metrics.
    middleware() {
      return (req, res, next) => {
        const started = process.hrtime.bigint();
        res.on('finish', () => {
          const path = req.originalUrl.split('?')[0];
          if (!path.startsWith('/api/')) return;
          const status = res.statusCode;
          store.increment(SERIES.requests);
          if (status >= 500) store.increment(SERIES.errors5xx);

          if (req.method === 'GET' && path === '/api/books/search' && status < 500) {
            store.observe(SERIES.searchMs, Number(process.hrtime.bigint() - started) / 1e6);
          }
          // A checkout starts when the order is committed; stock that changed under it (409)
          // fails it, and so does a payment that is declined, cancelled or times out (402).
          if (req.method === 'POST' && path === '/api/checkout/orders' && (status === 201 || status === 409)) {
            store.increment(SERIES.checkoutAttempts);
            if (status === 409) store.increment(SERIES.checkoutFailures);
          }
          if (req.method === 'POST' && PAYMENT_PATH.test(path) && (status === 402 || res.locals.paymentFailed)) {
            store.increment(SERIES.checkoutFailures);
          }
        });
        next();
      };
    },

    // Order commitment (checkoutService.createOrder). Stock conflicts and unexpected errors
    // are aborts; requests refused before anything is written (bad address, empty cart) are not.
    recordOrderCommit(outcome, { attempts = 1 } = {}) {
      if (outcome === 'rejected') return;
      store.increment(SERIES.commitAttempts);
      if (outcome === 'aborted') store.increment(SERIES.commitAborts);
      if (attempts > 1) store.increment(SERIES.commitRetries, attempts - 1);
    },

    recordLoginFailure({ locked = false } = {}) {
      store.increment(SERIES.loginFailures);
      if (locked) store.increment(SERIES.lockouts);
    },

    recordEmailFailure() {
      store.increment(SERIES.emailFailures);
    },

    recordPageLoad(durationMs) {
      store.observe(SERIES.pageLoadMs, durationMs);
    },

    // Connection pool use from the driver's connection-monitoring events, per server.
    instrumentPool(client) {
      maxPoolSize = client.options?.maxPoolSize || maxPoolSize;
      const change = (address, by) => pools.set(address, Math.max(0, (pools.get(address) || 0) + by));
      client.on('connectionCheckedOut', (event) => change(event.address, 1));
      client.on('connectionCheckedIn', (event) => change(event.address, -1));
      client.on('connectionPoolClosed', (event) => pools.delete(event.address));
    },

    // Starts the periodic alert check. The timer never keeps the process alive.
    start({ intervalMs = 30 * 1000, log, notify } = {}) {
      const timer = setInterval(() => {
        check({ log, notify }).catch((error) => console.error(`[monitoring] check failed: ${error.name}`));
      }, intervalMs);
      timer.unref();
      return () => clearInterval(timer);
    },

    reset() {
      store.reset();
      pools.clear();
      poolOverSince = null;
      failedDatabaseChecks = 0;
      lastStatuses = new Map();
    },
  };
}

// The process-wide monitor used by the application.
const monitor = createMonitor();

module.exports = { monitor, createMonitor, pingDatabase, DEFINITIONS };
