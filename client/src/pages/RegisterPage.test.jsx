// UT01 (client) - REQ-1 registration screen.
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, vi } from 'vitest';
import { renderApp } from '../test/render.jsx';
import { axeViolations } from '../test/a11y.js';
import { mockApi, lastBody } from '../test/fetchMock.js';
import { getToken } from '../api/http.js';

afterEach(() => vi.restoreAllMocks());

async function fill(user, fields) {
  for (const [label, value] of Object.entries(fields)) {
    const input = screen.getByLabelText(new RegExp(`^${label}`));
    await user.clear(input);
    if (value) await user.type(input, value);
  }
}

const submit = (user) => user.click(screen.getByRole('button', { name: 'Create account' }));

const DIVYA = { id: 'u9', name: 'Divya Kamath', email: 'divya.kamath@testmail.example', role: 'Buyer', status: 'Active' };

// The registration response, plus the catalog the new user lands on.
function registerApi(response = [201, { token: 'h.p.s', user: DIVYA }]) {
  return mockApi({
    'POST /auth/register': () => response,
    'GET /books/categories': () => [200, { items: [] }],
    'GET /books?page=1&sort=title_asc': () => [200, { items: [], page: 1, totalPages: 1, total: 0 }],
  });
}

describe('Registration page', () => {
  test('TC-ST01-01 / SASD 4.3.1: valid details create the account and sign the user in straight away', async () => {
    const user = userEvent.setup();
    const spy = registerApi();
    renderApp('/register');
    await fill(user, { Name: 'Divya Kamath', 'E-mail address': 'divya.kamath@testmail.example', Password: 'BookTest#2026' });
    await submit(user);

    expect(await screen.findByText('Welcome, Divya Kamath. Your account has been created and you are logged in.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account menu for Divya Kamath' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Create an account' })).not.toBeInTheDocument();
    expect(getToken()).toBe('h.p.s');
    expect(screen.getByRole('link', { name: 'Cart, 0 items' })).toBeInTheDocument();
    expect(spy.mock.calls.some(([url]) => url === '/api/cart' || url === '/api/auth/login')).toBe(false);
    expect(lastBody(spy, 'POST', '/auth/register')).toEqual({
      name: 'Divya Kamath',
      email: 'divya.kamath@testmail.example',
      password: 'BookTest#2026',
    });
  });

  test('TC-ST01-06 / TC-NFR-UI-02: empty mandatory fields show inline errors with an icon, and nothing is sent', async () => {
    const user = userEvent.setup();
    const spy = mockApi({});
    renderApp('/register');
    await submit(user);

    for (const label of ['Name', 'E-mail address', 'Password']) {
      const input = screen.getByLabelText(new RegExp(`^${label}`));
      expect(input).toHaveAttribute('aria-invalid', 'true');
      const error = document.getElementById(input.getAttribute('aria-describedby'));
      expect(error).toHaveTextContent(`${label} is required.`);
      expect(error.querySelector('svg')).not.toBeNull();
    }
    expect(screen.getByLabelText(/^Name/)).toHaveFocus();
    expect(spy).not.toHaveBeenCalled();
  });

  test.each(['divya.kamath.testmail.example', 'divya@', '@testmail.example'])(
    'TC-ST01-07: invalid e-mail "%s" shows an inline error on the e-mail field',
    async (email) => {
      const user = userEvent.setup();
      const spy = mockApi({});
      renderApp('/register');
      await fill(user, { Name: 'Divya Kamath', 'E-mail address': email, Password: 'BookTest#2026' });
      await submit(user);
      expect(screen.getByText('Enter a valid e-mail address.')).toBeInTheDocument();
      expect(spy).not.toHaveBeenCalled();
    },
  );

  test('TC-ST01-02: a duplicate e-mail shows "e-mail already registered" beneath the e-mail field', async () => {
    const user = userEvent.setup();
    mockApi({
      'POST /auth/register': () => [
        409,
        { error: { message: 'e-mail already registered', fields: { email: 'e-mail already registered' } } },
      ],
    });
    renderApp('/register');
    await fill(user, { Name: 'Anita Rao', 'E-mail address': 'anita.rao@testmail.example', Password: 'BookTest#2026' });
    await submit(user);

    const emailInput = screen.getByLabelText(/^E-mail address/);
    expect(await screen.findByText('e-mail already registered')).toBeInTheDocument();
    expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput).toHaveFocus();
  });

  test('a phone number that is not 10 digits is rejected before sending', async () => {
    const user = userEvent.setup();
    const spy = mockApi({});
    renderApp('/register');
    await fill(user, { Name: 'A', 'E-mail address': 'a@b.example', Password: 'x', 'Phone number': '90000abc21' });
    await submit(user);
    expect(screen.getByText('Phone number must be exactly 10 digits.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  test('a partly filled address asks for the remaining parts', async () => {
    const user = userEvent.setup();
    const spy = mockApi({});
    renderApp('/register');
    await fill(user, { Name: 'A', 'E-mail address': 'a@b.example', Password: 'x', Address: 'House 44, Temple Road' });
    await submit(user);
    expect(screen.getByText('City is required.')).toBeInTheDocument();
    expect(screen.getByText('State is required.')).toBeInTheDocument();
    expect(screen.getByText('Postal code is required.')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  test('a complete address and phone are sent with the registration', async () => {
    const user = userEvent.setup();
    const spy = registerApi();
    renderApp('/register');
    await fill(user, {
      Name: 'Divya Kamath',
      'E-mail address': 'divya.kamath@testmail.example',
      Password: 'BookTest#2026',
      'Phone number': '9000000099',
      Address: 'Flat 12, Lakeview Apartments',
      City: 'Bengaluru',
      State: 'Karnataka',
      'Postal code': '560011',
    });
    await submit(user);
    await screen.findByRole('button', { name: 'Account menu for Divya Kamath' });
    expect(lastBody(spy, 'POST', '/auth/register')).toMatchObject({
      phone: '9000000099',
      address: { line: 'Flat 12, Lakeview Apartments', city: 'Bengaluru', state: 'Karnataka', postalCode: '560011' },
    });
  });

  test('a network failure shows a form-level error', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    renderApp('/register');
    await fill(user, { Name: 'A', 'E-mail address': 'a@b.example', Password: 'x' });
    await submit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be reached');
  });

  test('TC-NFR-QUA-17: the registration form has no accessibility violations, including with errors shown', async () => {
    const user = userEvent.setup();
    mockApi({});
    const { container } = renderApp('/register');
    expect(await axeViolations(container)).toEqual([]);
    await submit(user);
    expect(await axeViolations(container)).toEqual([]);
  });
});
