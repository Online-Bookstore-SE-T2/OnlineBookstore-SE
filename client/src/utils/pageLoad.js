// SASD 4.4.3 / NFR01-a: reports how long this page took to load, once, so the server can
// track the 95th-percentile page load time. Only the duration is sent; failures are ignored
// because monitoring must never get in the way of the page.
const ENDPOINT = '/api/metrics/page-load';

export function pageLoadDuration(win = window) {
  const [entry] = win.performance?.getEntriesByType?.('navigation') || [];
  if (!entry) return null;
  const duration = Math.round(entry.loadEventEnd > 0 ? entry.loadEventEnd - entry.startTime : 0);
  return duration > 0 ? duration : null;
}

function send(win, durationMs) {
  const body = JSON.stringify({ durationMs });
  try {
    if (win.navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
  } catch {
    // Fall back to fetch below.
  }
  win.fetch?.(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
    .catch(() => {});
}

export function reportPageLoad(win = window) {
  // loadEventEnd is only set after the load handlers finish, so measure on the next tick.
  const measure = () => win.setTimeout(() => {
    const durationMs = pageLoadDuration(win);
    if (durationMs) send(win, durationMs);
  }, 0);
  if (win.document.readyState === 'complete') measure();
  else win.addEventListener('load', measure, { once: true });
}
