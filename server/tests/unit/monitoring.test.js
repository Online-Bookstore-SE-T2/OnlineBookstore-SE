// SASD 4.4.3 monitoring: the metrics store, the thresholds and the alert loop.
const { EventEmitter } = require('events');
const { createMetricsStore, SAMPLE_LIMIT } = require('../../src/monitoring/metrics');
const { createMonitor, DEFINITIONS } = require('../../src/monitoring/monitor');

const MINUTE = 60 * 1000;

function clock(start = Date.UTC(2026, 10, 9, 10, 0, 0)) {
  let time = start;
  return { now: () => time, advance: (ms) => { time += ms; } };
}

// A database that answers pings until told otherwise.
function fakeDatabase() {
  const db = { up: true, readyState: 1 };
  db.db = { admin: () => ({ ping: () => (db.up ? Promise.resolve({ ok: 1 }) : Promise.reject(new Error('down'))) }) };
  return db;
}

function silentLog() {
  return { error: jest.fn(), warn: jest.fn() };
}

const byId = (results, id) => results.find((result) => result.id === id);

describe('metrics store', () => {
  test('counts fall out of the window once they are older than it', () => {
    const time = clock();
    const store = createMetricsStore({ now: time.now });
    store.increment('a', 3);
    time.advance(5 * MINUTE);
    store.increment('a');
    expect(store.count('a', 15 * MINUTE)).toBe(4);
    expect(store.count('a', 1 * MINUTE)).toBe(1);
    time.advance(11 * MINUTE);
    expect(store.count('a', 15 * MINUTE)).toBe(1);
    time.advance(5 * MINUTE);
    expect(store.count('a', 15 * MINUTE)).toBe(0);
    expect(store.total('a')).toBe(4);
  });

  test('percentile uses the nearest rank and is null without samples', () => {
    const store = createMetricsStore();
    expect(store.percentile('t', 95)).toBeNull();
    for (let ms = 1; ms <= 100; ms += 1) store.observe('t', ms);
    expect(store.percentile('t', 95)).toBe(95);
    expect(store.percentile('t', 50)).toBe(50);
    expect(store.percentile('t', 0)).toBe(1);
  });

  test('ignores values that are not durations', () => {
    const store = createMetricsStore();
    [NaN, -1, Infinity, '5'].forEach((value) => store.observe('t', value));
    expect(store.samples('t')).toEqual([]);
  });

  test('memory stays bounded however many samples arrive in a minute', () => {
    const store = createMetricsStore();
    for (let i = 0; i < SAMPLE_LIMIT * 4; i += 1) store.observe('t', i);
    expect(store.samples('t')).toHaveLength(SAMPLE_LIMIT);
  });
});

describe('monitor thresholds (SASD 4.4.3)', () => {
  let time;
  let monitor;

  beforeEach(() => {
    time = clock();
    monitor = createMonitor({ now: time.now, database: fakeDatabase() });
  });

  test('covers every SASD 4.4.3 metric with its threshold', () => {
    expect(Object.fromEntries(DEFINITIONS.map((d) => [d.id, d.threshold]))).toEqual({
      checkoutFailureRate: 0.1,
      orderCommitAbortRate: 0.02,
      searchResponseP95: 2000,
      pageLoadP95: 3000,
      api5xxRate: 0.01,
      failedLoginsPerMinute: 20,
      emailPermanentFailures: 0,
      dbPoolUtilisation: 0.8,
      databaseAvailability: 1,
    });
  });

  test('an idle service reports no data rather than an alert', () => {
    const results = monitor.evaluate();
    for (const id of ['checkoutFailureRate', 'orderCommitAbortRate', 'searchResponseP95', 'pageLoadP95', 'api5xxRate']) {
      expect(byId(results, id).status).toBe('no-data');
    }
    expect(byId(results, 'failedLoginsPerMinute')).toMatchObject({ value: 0, status: 'ok' });
  });

  test('order commit aborts above 2% alert; refusals that write nothing are not counted', () => {
    for (let i = 0; i < 49; i += 1) monitor.recordOrderCommit('committed');
    monitor.recordOrderCommit('rejected');
    expect(byId(monitor.evaluate(), 'orderCommitAbortRate')).toMatchObject({ value: 0, samples: 49, status: 'ok' });
    monitor.recordOrderCommit('aborted', { attempts: 3 });
    expect(byId(monitor.evaluate(), 'orderCommitAbortRate')).toMatchObject({ value: 0.02, samples: 50, status: 'ok' });
    monitor.recordOrderCommit('aborted');
    expect(byId(monitor.evaluate(), 'orderCommitAbortRate').status).toBe('alert');
    expect(monitor.snapshot().totals.orderCommitRetries).toBe(2);
  });

  test('search and page-load p95 alert above 2 s and 3 s once there are enough samples', () => {
    for (let i = 0; i < 9; i += 1) monitor.store.observe('search.ms', 2500);
    expect(byId(monitor.evaluate(), 'searchResponseP95').status).toBe('no-data');
    monitor.store.observe('search.ms', 2500);
    expect(byId(monitor.evaluate(), 'searchResponseP95')).toMatchObject({ value: 2500, status: 'alert' });

    for (let i = 0; i < 19; i += 1) monitor.recordPageLoad(1200);
    monitor.recordPageLoad(9000);
    expect(byId(monitor.evaluate(), 'pageLoadP95')).toMatchObject({ value: 1200, status: 'ok' });
  });

  test('more than 20 failed logins in one minute alerts, and the count resets after the minute', () => {
    for (let i = 0; i < 20; i += 1) monitor.recordLoginFailure();
    expect(byId(monitor.evaluate(), 'failedLoginsPerMinute').status).toBe('ok');
    monitor.recordLoginFailure({ locked: true });
    expect(byId(monitor.evaluate(), 'failedLoginsPerMinute')).toMatchObject({ value: 21, status: 'alert' });
    expect(monitor.snapshot().totals.lockouts).toBe(1);
    time.advance(MINUTE);
    expect(byId(monitor.evaluate(), 'failedLoginsPerMinute').status).toBe('ok');
  });

  test('any permanent e-mail failure alerts', () => {
    monitor.recordEmailFailure();
    expect(byId(monitor.evaluate(), 'emailPermanentFailures')).toMatchObject({ value: 1, status: 'alert' });
  });

  test('connection pool use alerts only when it stays above 80% for five minutes', async () => {
    const client = new EventEmitter();
    client.options = { maxPoolSize: 10 };
    monitor.instrumentPool(client);
    const checkOut = (n, address = 'db-1:27017') => { for (let i = 0; i < n; i += 1) client.emit('connectionCheckedOut', { address }); };
    const log = silentLog();

    checkOut(9);
    checkOut(2, 'db-2:27017');
    expect(byId(await monitor.check({ log }), 'dbPoolUtilisation')).toMatchObject({ value: 0.9, status: 'ok' });
    time.advance(4 * MINUTE);
    expect(byId(await monitor.check({ log }), 'dbPoolUtilisation').status).toBe('ok');
    time.advance(MINUTE);
    expect(byId(await monitor.check({ log }), 'dbPoolUtilisation').status).toBe('alert');

    client.emit('connectionCheckedIn', { address: 'db-1:27017' });
    client.emit('connectionCheckedIn', { address: 'db-1:27017' });
    expect(byId(await monitor.check({ log }), 'dbPoolUtilisation')).toMatchObject({ value: 0.7, status: 'ok' });
  });

  test('the database availability alert needs two consecutive failed checks', async () => {
    const database = fakeDatabase();
    monitor = createMonitor({ now: time.now, database });
    const log = silentLog();
    database.up = false;
    expect(byId(await monitor.check({ log }), 'databaseAvailability').status).toBe('ok');
    expect(byId(await monitor.check({ log }), 'databaseAvailability').status).toBe('alert');
    database.up = true;
    expect(byId(await monitor.check({ log }), 'databaseAvailability').status).toBe('ok');
    database.readyState = 0;
    await monitor.check({ log });
    expect(byId(await monitor.check({ log }), 'databaseAvailability').status).toBe('alert');
  });
});

describe('alert loop', () => {
  test('an alert is logged and notified once when it starts, and logged again when it clears', async () => {
    const time = clock();
    const monitor = createMonitor({ now: time.now, database: fakeDatabase() });
    const log = silentLog();
    const notify = jest.fn().mockResolvedValue(true);

    monitor.recordEmailFailure();
    await monitor.check({ log, notify });
    await monitor.check({ log, notify });
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls[0][0]).toMatch(/^\[alert\] emailPermanentFailures value=1 threshold=0 window=15m instance=/);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({ id: 'emailPermanentFailures', status: 'alert' });

    time.advance(16 * MINUTE);
    await monitor.check({ log, notify });
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0][0]).toMatch(/^\[alert-resolved\] emailPermanentFailures value=0/);
  });

  test('rates are logged as percentages', async () => {
    const monitor = createMonitor({ database: fakeDatabase() });
    const log = silentLog();
    for (let i = 0; i < 4; i += 1) monitor.store.increment('checkout.attempts');
    monitor.store.increment('checkout.attempts');
    monitor.store.increment('checkout.failures');
    await monitor.check({ log });
    expect(log.error.mock.calls.map(([line]) => line).join('\n')).toContain('[alert] checkoutFailureRate value=20.0% threshold=10%');
  });

  test('a failing notifier never breaks the check', async () => {
    const monitor = createMonitor({ database: fakeDatabase() });
    monitor.recordEmailFailure();
    await expect(monitor.check({ log: silentLog(), notify: () => Promise.reject(new Error('smtp down')) })).resolves.toBeDefined();
  });

  test('start runs the check on an interval until stopped', async () => {
    jest.useFakeTimers();
    try {
      const monitor = createMonitor({ database: fakeDatabase() });
      const log = silentLog();
      const notify = jest.fn();
      monitor.recordEmailFailure();
      const stop = monitor.start({ intervalMs: 1000, log, notify });
      expect(notify).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1000);
      expect(notify).toHaveBeenCalledTimes(1);
      stop();
      monitor.reset();
      monitor.recordEmailFailure();
      await jest.advanceTimersByTimeAsync(5000);
      expect(notify).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
