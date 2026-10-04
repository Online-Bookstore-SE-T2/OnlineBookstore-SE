import strings from '../resources/strings.js';

// The session token is kept in browser storage (SRS 3.2) and sent as a bearer token (SRS 3.3).
const TOKEN_KEY = 'bookstore.session';

export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields || {};
  }
}

export function getToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage unavailable (private mode): the session lasts for this page only.
  }
}

export function clearToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing stored.
  }
}

let unauthorizedHandler = null;

// Lets the auth context react when the server rejects the stored session.
export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

// JSON request to the REST API. Personal data always travels in the body, never in the URL (SRS 6.3).
export async function apiRequest(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, strings.errors.network);
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && token && unauthorizedHandler) unauthorizedHandler();
    throw new ApiError(response.status, data?.error?.message || strings.errors.generic, data?.error?.fields);
  }
  return data;
}
