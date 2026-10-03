// UT03 (client) - REQ-3 profile details, password and delivery addresses.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, vi } from 'vitest';
import { renderApp } from '../../test/render.jsx';
import { axeViolations } from '../../test/a11y.js';
import { mockApi, lastBody } from '../../test/fetchMock.js';
import { setToken } from '../../api/http.js';

afterEach(() => vi.restoreAllMocks());

const ADDR = (n, extra = {}) => ({
  id: `a${n}`,
  line: `Address line ${n}`,
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: `56001${n}`,
  isDefault: n === 1,
  ...extra,
});

function profileUser(overrides = {}) {
  return {
    id: 'u1',
    name: 'Anita Rao',
    email: 'anita.rao@testmail.example',
    phone: '9000000001',
    role: 'Buyer',
    status: 'Active',
    registrationDate: '2026-09-01T10:00:00.000Z',
    addresses: [],
    ...overrides,
  };
}

// Logged-in session whose profile is `user`, plus any extra routes.
function setup(user, routes = {}) {
  setToken('h.p.s');
  return mockApi({
    'GET /auth/session': () => [200, { user }],
    'GET /users/me': () => [200, { user }],
    ...routes,
  });
}

async function openProfile() {
  renderApp('/profile');
  return screen.findByRole('heading', { name: 'Your profile' });
}

describe('Profile page', () => {
  test('TC-ST03-11: a visitor is sent to the login page and returned to the profile after logging in', async () => {
    const user = userEvent.setup();
    mockApi({
      'POST /auth/login': () => [200, { token: 'h.p.s', user: profileUser() }],
      'GET /users/me': () => [200, { user: profileUser() }],
    });
    renderApp('/profile');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^E-mail address/), 'anita.rao@testmail.example');
    await user.type(screen.getByLabelText(/^Password/), 'BookTest#2026');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument();
  });

  test('TC-ST03-01: shows the stored name, e-mail and phone', async () => {
    setup(profileUser());
    await openProfile();
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Anita Rao');
    expect(screen.getByLabelText(/^E-mail address/)).toHaveValue('anita.rao@testmail.example');
    expect(screen.getByLabelText(/^Phone number/)).toHaveValue('9000000001');
    expect(screen.getByText(/Member since 01 Sept? 2026/)).toBeInTheDocument();
  });

  test('TC-ST03-02: saving a new name and phone sends them and confirms', async () => {
    const user = userEvent.setup();
    const spy = setup(profileUser(), {
      'PATCH /users/me': (body) => [200, { user: profileUser(body) }],
    });
    await openProfile();
    await user.clear(screen.getByLabelText(/^Name/));
    await user.type(screen.getByLabelText(/^Name/), 'Anita R Rao');
    await user.clear(screen.getByLabelText(/^Phone number/));
    await user.type(screen.getByLabelText(/^Phone number/), '9000000011');
    await user.click(screen.getByRole('button', { name: 'Save details' }));

    expect(await screen.findByText('Your profile has been updated.')).toBeInTheDocument();
    expect(lastBody(spy, 'PATCH', '/users/me')).toEqual({
      name: 'Anita R Rao',
      email: 'anita.rao@testmail.example',
      phone: '9000000011',
    });
  });

  test('TC-ST03-03: an empty name shows an inline error and nothing is sent', async () => {
    const user = userEvent.setup();
    const spy = setup(profileUser());
    await openProfile();
    await user.clear(screen.getByLabelText(/^Name/));
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByText('Name is required.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveFocus();
    expect(spy.mock.calls.some(([, o]) => o?.method === 'PATCH')).toBe(false);
  });

  test('a duplicate e-mail from the server is shown on the e-mail field', async () => {
    const user = userEvent.setup();
    setup(profileUser(), {
      'PATCH /users/me': () => [409, { error: { message: 'e-mail already registered', fields: { email: 'e-mail already registered' } } }],
    });
    await openProfile();
    await user.clear(screen.getByLabelText(/^E-mail address/));
    await user.type(screen.getByLabelText(/^E-mail address/), 'rahul.menon@testmail.example');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(await screen.findByText('e-mail already registered')).toBeInTheDocument();
  });

  test('changing the password shows the server error for a wrong current password, then succeeds', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const spy = setup(profileUser(), {
      'PUT /users/me/password': () => {
        attempt += 1;
        return attempt === 1
          ? [400, { error: { message: 'x', fields: { currentPassword: 'Current password is incorrect.' } } }]
          : [200, { message: 'ok' }];
      },
    });
    await openProfile();
    await user.type(screen.getByLabelText(/^Current password/), 'wrong');
    await user.type(screen.getByLabelText(/^New password/), 'NewPass#2026');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/^Current password/));
    await user.type(screen.getByLabelText(/^Current password/), 'BookTest#2026');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Your password has been changed.')).toBeInTheDocument();
    expect(lastBody(spy, 'PUT', '/users/me/password')).toEqual({ currentPassword: 'BookTest#2026', newPassword: 'NewPass#2026' });
    expect(screen.getByLabelText(/^Current password/)).toHaveValue('');
  });

  test('TC-ST03-04: adding an address sends it and lists the result', async () => {
    const user = userEvent.setup();
    const spy = setup(profileUser(), {
      'POST /users/me/addresses': (body) => [201, { addresses: [{ id: 'a1', ...body, isDefault: true }] }],
    });
    await openProfile();
    await user.click(screen.getByRole('button', { name: 'Add address' }));
    await user.type(screen.getByLabelText(/^Address/), 'Flat 12, Lakeview Apartments');
    await user.type(screen.getByLabelText(/^City/), 'Bengaluru');
    await user.type(screen.getByLabelText(/^State/), 'Karnataka');
    await user.type(screen.getByLabelText(/^Postal code/), '560011');
    await user.click(screen.getByRole('button', { name: 'Save address' }));

    expect(await screen.findByText('Address saved.')).toBeInTheDocument();
    expect(screen.getByText('Flat 12, Lakeview Apartments')).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(lastBody(spy, 'POST', '/users/me/addresses')).toEqual({
      line: 'Flat 12, Lakeview Apartments',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560011',
    });
  });

  test.each(['56A011', '5600111', '56001'])('TC-ST03-09 / TC-ST03-10: postal code "%s" shows an inline error', async (code) => {
    const user = userEvent.setup();
    const spy = setup(profileUser());
    await openProfile();
    await user.click(screen.getByRole('button', { name: 'Add address' }));
    await user.type(screen.getByLabelText(/^Address/), 'Line');
    await user.type(screen.getByLabelText(/^City/), 'City');
    await user.type(screen.getByLabelText(/^State/), 'State');
    await user.type(screen.getByLabelText(/^Postal code/), code);
    await user.click(screen.getByRole('button', { name: 'Save address' }));
    expect(screen.getByText('Postal code must be exactly 6 digits.')).toBeInTheDocument();
    expect(spy.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
  });

  test('TC-ST03-06: with five addresses saved, adding another is disabled and the limit is explained', async () => {
    setup(profileUser({ addresses: [1, 2, 3, 4, 5].map((n) => ADDR(n)) }));
    await openProfile();
    expect(screen.getByRole('button', { name: 'Add address' })).toBeDisabled();
    expect(screen.getByText(/saved five addresses, the maximum/)).toBeInTheDocument();
    expect(screen.getByText('You have saved 5 of 5 addresses.')).toBeInTheDocument();
  });

  test('TC-ST03-08: an address can be edited', async () => {
    const user = userEvent.setup();
    const spy = setup(profileUser({ addresses: [ADDR(1)] }), {
      'PUT /users/me/addresses/a1': (body) => [200, { addresses: [{ ...ADDR(1), ...body }] }],
    });
    await openProfile();
    await user.click(screen.getByRole('button', { name: 'Edit address Address line 1' }));
    const line = screen.getByLabelText(/^Address/);
    expect(line).toHaveValue('Address line 1');
    await user.clear(line);
    await user.type(line, 'Flat 12, Lakeview Apartments, 6th Cross');
    await user.click(screen.getByRole('button', { name: 'Save address' }));
    expect(await screen.findByText('Flat 12, Lakeview Apartments, 6th Cross')).toBeInTheDocument();
    expect(lastBody(spy, 'PUT', '/users/me/addresses/a1').line).toBe('Flat 12, Lakeview Apartments, 6th Cross');
  });

  test('another address can be made the default', async () => {
    const user = userEvent.setup();
    setup(profileUser({ addresses: [ADDR(1), ADDR(2)] }), {
      'PATCH /users/me/addresses/a2/default': () => [200, { addresses: [ADDR(1, { isDefault: false }), ADDR(2, { isDefault: true })] }],
    });
    await openProfile();
    await user.click(screen.getByRole('button', { name: 'Make Address line 2 the default address' }));
    expect(await screen.findByText('Default address changed.')).toBeInTheDocument();
    const second = screen.getByText('Address line 2').closest('li');
    expect(within(second).getByText('Default')).toBeInTheDocument();
  });

  test('TC-NFR-UI-03 / TC-ST03-07: deleting asks for confirmation; Cancel keeps the address, Confirm deletes it', async () => {
    const user = userEvent.setup();
    const spy = setup(profileUser({ addresses: [ADDR(1), ADDR(2)] }), {
      'DELETE /users/me/addresses/a2': () => [200, { addresses: [ADDR(1)] }],
    });
    await openProfile();
    const deleteButton = screen.getByRole('button', { name: 'Delete address Address line 2' });
    await user.click(deleteButton);

    const dialog = screen.getByRole('alertdialog', { name: 'Delete this address?' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleteButton).toHaveFocus();
    expect(spy.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(false);

    await user.click(deleteButton);
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete address' }));
    expect(await screen.findByText('Address deleted.')).toBeInTheDocument();
    expect(screen.queryByText('Address line 2')).not.toBeInTheDocument();
  });

  test('focus stays inside the confirmation dialog when tabbing', async () => {
    const user = userEvent.setup();
    setup(profileUser({ addresses: [ADDR(1)] }));
    await openProfile();
    await user.click(screen.getByRole('button', { name: 'Delete address Address line 1' }));
    const dialog = screen.getByRole('alertdialog');
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Delete address' })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Delete address' })).toHaveFocus();
  });

  test('a suspended account sees a banner and cannot submit changes', async () => {
    setup(profileUser({ status: 'Suspended', addresses: [ADDR(1)] }));
    await openProfile();
    expect(screen.getByText(/Your account is suspended/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save details' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Add address' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete address/ })).not.toBeInTheDocument();
  });

  test('the account menu links to the profile', async () => {
    const user = userEvent.setup();
    setup(profileUser());
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: /Account menu/ }));
    await user.click(screen.getByRole('link', { name: 'Profile' }));
    expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument();
  });

  test('TC-NFR-QUA-17: the profile page has no accessibility violations, with addresses, form and dialog open', async () => {
    const user = userEvent.setup();
    setup(profileUser({ addresses: [ADDR(1), ADDR(2)] }));
    const { container } = renderApp('/profile');
    await screen.findByRole('heading', { name: 'Your profile' });
    expect(await axeViolations(container)).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Add address' }));
    await user.click(screen.getByRole('button', { name: 'Save address' }));
    await waitFor(() => expect(screen.getByText('City is required.')).toBeInTheDocument());
    expect(await axeViolations(container)).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Delete address Address line 1' }));
    expect(await axeViolations(container)).toEqual([]);
  }, 30000);
});
