import { vi } from 'vitest';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

// Replaces fetch with a router of `${METHOD} ${path}` -> handler(body) returning [status, json].
// Unmatched requests fail the test loudly. Returns the spy so calls can be inspected.
export function mockApi(routes) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const method = options.method || 'GET';
    const path = String(url).replace(/^\/api/, '');
    const key = `${method} ${path}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Unmocked API call: ${key}`);
    const body = options.body ? JSON.parse(options.body) : undefined;
    const [status, json] = await handler(body, options);
    return jsonResponse(status, json);
  });
}

// Body of the most recent call to the given route.
export function lastBody(spy, method, path) {
  const call = [...spy.mock.calls].reverse().find(([url, options = {}]) => url === `/api${path}` && (options.method || 'GET') === method);
  return call && call[1].body ? JSON.parse(call[1].body) : undefined;
}
