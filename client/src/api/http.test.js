// SASD 4.4.1 / 4.4.2 (client): error responses keep their code, and a 500 shows its reference.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError, apiRequest } from './http.js';
import { mockApi } from '../test/fetchMock.js';

afterEach(() => vi.restoreAllMocks());

async function failure(route, response) {
  mockApi({ [route]: () => response });
  const [method, path] = route.split(' ');
  return apiRequest(path, { method }).catch((err) => err);
}

describe('apiRequest errors', () => {
  test('keeps the status, message, fields and SASD error code', async () => {
    const err = await failure('POST /auth/register', [400, {
      error: { code: 'VALIDATION_FAILED', message: 'Some fields are invalid.', fields: { email: 'Enter a valid e-mail address.' } },
    }]);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_FAILED', message: 'Some fields are invalid.', correlationId: null });
    expect(err.fields).toEqual({ email: 'Enter a valid e-mail address.' });
  });

  test('a 500 shows the correlation id so the user can quote it', async () => {
    const err = await failure('GET /orders', [500, {
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again later.', correlationId: 'abc-123-def' },
    }]);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.correlationId).toBe('abc-123-def');
    expect(err.message).toBe('Something went wrong. Please try again later. Reference: abc-123-def');
  });

  test('a body without an error object falls back to the generic message', async () => {
    const err = await failure('GET /orders', [502, null]);
    expect(err).toMatchObject({ status: 502, code: null, message: 'Something went wrong. Please try again.' });
  });

  test('a network failure is reported with its own code', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await apiRequest('/orders').catch((e) => e);
    expect(err).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});
