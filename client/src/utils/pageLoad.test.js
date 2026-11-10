// SASD 4.4.3 / NFR01-a (client): the page-load time is reported once, and nothing else is sent.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { pageLoadDuration, reportPageLoad } from './pageLoad.js';

afterEach(() => vi.useRealTimers());

function fakeWindow({ entry = { startTime: 0, loadEventEnd: 1834.6 }, readyState = 'complete', beacon = true } = {}) {
  const listeners = {};
  return {
    performance: { getEntriesByType: (type) => (type === 'navigation' && entry ? [entry] : []) },
    navigator: { sendBeacon: beacon ? vi.fn(() => true) : undefined },
    fetch: vi.fn(() => Promise.resolve({ ok: true })),
    document: { readyState },
    setTimeout: (fn) => fn(),
    addEventListener: vi.fn((name, fn) => { listeners[name] = fn; }),
    fire: (name) => listeners[name](),
  };
}

async function beaconBody(win) {
  const [url, blob] = win.navigator.sendBeacon.mock.calls[0];
  // jsdom's Blob has no text(), so read it the way older browsers do.
  const text = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsText(blob);
  });
  return { url, type: blob.type, body: JSON.parse(text) };
}

describe('page load reporting', () => {
  test('measures from navigation start to the end of the load event', () => {
    expect(pageLoadDuration(fakeWindow())).toBe(1835);
    expect(pageLoadDuration(fakeWindow({ entry: { startTime: 0, loadEventEnd: 0 } }))).toBeNull();
    expect(pageLoadDuration(fakeWindow({ entry: null }))).toBeNull();
  });

  test('a loaded page sends only its duration, once, by beacon', async () => {
    const win = fakeWindow();
    reportPageLoad(win);
    expect(win.navigator.sendBeacon).toHaveBeenCalledTimes(1);
    expect(await beaconBody(win)).toEqual({ url: '/api/metrics/page-load', type: 'application/json', body: { durationMs: 1835 } });
    expect(win.fetch).not.toHaveBeenCalled();
  });

  test('a page still loading reports after its load event', () => {
    const win = fakeWindow({ readyState: 'loading' });
    reportPageLoad(win);
    expect(win.navigator.sendBeacon).not.toHaveBeenCalled();
    win.fire('load');
    expect(win.navigator.sendBeacon).toHaveBeenCalledTimes(1);
  });

  test('without sendBeacon it falls back to a keepalive fetch', () => {
    const win = fakeWindow({ beacon: false });
    reportPageLoad(win);
    expect(win.fetch).toHaveBeenCalledWith('/api/metrics/page-load', expect.objectContaining({ method: 'POST', keepalive: true, body: '{"durationMs":1835}' }));
  });

  test('nothing is sent when the browser has no navigation timing', () => {
    const win = fakeWindow({ entry: null });
    reportPageLoad(win);
    expect(win.navigator.sendBeacon).not.toHaveBeenCalled();
    expect(win.fetch).not.toHaveBeenCalled();
  });
});
