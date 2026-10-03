// UT02 (client) - REQ-2 login, session restore and log-out.
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, vi } from 'vitest';
import { renderApp } from '../test/render.jsx';
import { axeViolations } from '../test/a11y.js';
import { mockApi, lastBody } from '../test/fetchMock.js';
import { getToken, setToken } from '../api/http.js';

afterEach(() => vi.restoreAllMocks());

const ANITA = { id: 'u1', name: 'Anita Rao', email: 'anita.rao@testmail.example', role: 'Buyer', status: 'Active' };

async function logIn(user, email = ANITA.email, password = 'BookTest#2026') {
  await user.type(screen.getByLabelText(/^E-mail address/), email);
  await user.type(screen.getByLabelText(/^Password/), password);
  await user.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('Login page', () => {
  test('TC-ST02-01: valid credentials store the token and show the account menu', async () => {
    const user = userEvent.setup();
    const spy = mockApi({ 'POST /auth/login': () => [200, { token: 'h.p.s', user: ANITA }] });
    renderApp('/login');
    await logIn(user);

    expect(await screen.findByRole('button', { name: 'Account menu for Anita Rao' })).toBeInTheDocument();
    expect(getToken()).toBe('h.p.s');
    expect(lastBody(spy, 'POST', '/auth/login')).toEqual({ email: ANITA.email, password: 'BookTest#2026' });
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
  });

  test('TC-ST02-02: a wrong password shows an error and no token is stored', async () => {
    const user = userEvent.setup();
    mockApi({ 'POST /auth/login': () => [401, { error: { message: 'Incorrect e-mail address or password.' } }] });
    renderApp('/login');
    await logIn(user, ANITA.email, 'WrongPass#99');

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect e-mail address or password.');
    expect(getToken()).toBeNull();
    expect(screen.getByLabelText(/^Password/)).toHaveValue('');
  });

  test('TC-ST02-09: a locked account shows the lock message', async () => {
    const user = userEvent.setup();
    mockApi({
      'POST /auth/login': () => [423, { error: { message: 'This account is locked for 15 minutes after five failed log-in attempts.' } }],
    });
    renderApp('/login');
    await logIn(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('locked for 15 minutes');
  });

  test('empty fields show inline errors and nothing is sent', async () => {
    const user = userEvent.setup();
    const spy = mockApi({});
    renderApp('/login');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByText('E-mail address is required.')).toBeInTheDocument();
    expect(screen.getByText('Password is required.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  test('a stored token is checked with the server and restores the session', async () => {
    setToken('h.p.s');
    mockApi({ 'GET /auth/session': () => [200, { user: ANITA }] });
    renderApp('/');
    expect(await screen.findByRole('button', { name: 'Account menu for Anita Rao' })).toBeInTheDocument();
  });

  test('TC-ST02-06: an expired or rejected stored token is cleared and the visitor sees Log in', async () => {
    setToken('h.p.s');
    mockApi({ 'GET /auth/session': () => [401, { error: { message: 'expired' } }] });
    renderApp('/');
    await waitFor(() => expect(getToken()).toBeNull());
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
  });

  test('TC-ST02-07: Log out calls the server, removes the token and returns to the visitor view', async () => {
    const user = userEvent.setup();
    setToken('h.p.s');
    const spy = mockApi({
      'GET /auth/session': () => [200, { user: ANITA }],
      'POST /auth/logout': () => [200, { message: 'ok' }],
    });
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Account menu for Anita Rao' }));
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(getToken()).toBeNull());
    expect(spy.mock.calls.some(([url, options]) => url === '/api/auth/logout' && options.method === 'POST')).toBe(true);
    expect(spy.mock.calls.find(([url]) => url === '/api/auth/logout')[1].headers.Authorization).toBe('Bearer h.p.s');
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
  });

  test('the account menu opens and closes from the keyboard', async () => {
    const user = userEvent.setup();
    setToken('h.p.s');
    mockApi({ 'GET /auth/session': () => [200, { user: ANITA }] });
    renderApp('/');
    const button = await screen.findByRole('button', { name: 'Account menu for Anita Rao' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  test('TC-NFR-SEC-19: credentials are sent in the request body, never in the URL', async () => {
    const user = userEvent.setup();
    const spy = mockApi({ 'POST /auth/login': () => [200, { token: 'h.p.s', user: ANITA }] });
    renderApp('/login');
    await logIn(user);
    await screen.findByRole('button', { name: /Account menu/ });
    for (const [url] of spy.mock.calls) {
      expect(url).not.toContain('anita');
      expect(url).not.toContain('BookTest');
    }
  });

  test('the login form has no accessibility violations', async () => {
    mockApi({});
    const { container } = renderApp('/login');
    expect(await axeViolations(container)).toEqual([]);
  });
});
