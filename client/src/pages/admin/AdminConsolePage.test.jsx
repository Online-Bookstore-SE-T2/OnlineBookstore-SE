// UT04 (client) - REQ-4 administration console.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, vi } from 'vitest';
import { renderApp } from '../../test/render.jsx';
import { axeViolations } from '../../test/a11y.js';
import { mockApi, lastBody } from '../../test/fetchMock.js';
import { setToken } from '../../api/http.js';

afterEach(() => vi.restoreAllMocks());

const ADMIN = { id: 'admin1', name: 'Admin User One', email: 'admin.one@testmail.example', role: 'Administrator', status: 'Active' };
const page = (items) => ({ items, page: 1, pageSize: 20, total: items.length, totalPages: 1 });
const user = (id, name, extra = {}) => ({
  id,
  name,
  email: `${id}@testmail.example`,
  role: 'Buyer',
  status: 'Active',
  registrationDate: '2026-09-01T00:00:00.000Z',
  ...extra,
});

const USERS = [ADMIN, user('b04', 'Vikram Desai'), user('s03', 'Mohan Rao', { role: 'Seller' })];

function setup(routes = {}, me = ADMIN) {
  setToken('h.p.s');
  return mockApi({
    'GET /auth/session': () => [200, { user: me }],
    'POST /admin/users/query': () => [200, page(USERS)],
    ...routes,
  });
}

async function openConsole() {
  renderApp('/admin');
  await screen.findByRole('heading', { name: 'Administration' });
  await screen.findByRole('table');
}

const tab = (name) => screen.getByRole('tab', { name });
const rowFor = (text) => screen.getByRole('cell', { name: text }).closest('tr');

describe('Administration console', () => {
  test('TC-ST04-12: a buyer gets no console link and the console URL shows no admin data', async () => {
    const spy = setup({}, user('b01', 'Anita Rao'));
    renderApp('/admin');
    expect(await screen.findByRole('heading', { name: 'You do not have access to this page' })).toBeInTheDocument();
    expect(spy.mock.calls.some(([url]) => url.startsWith('/api/admin'))).toBe(false);

    await userEvent.setup().click(screen.getByRole('button', { name: /Account menu/ }));
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
  });

  test('an administrator reaches the console from the account menu', async () => {
    const u = userEvent.setup();
    setup();
    renderApp('/');
    await u.click(await screen.findByRole('button', { name: /Account menu/ }));
    await u.click(screen.getByRole('link', { name: 'Administration' }));
    expect(await screen.findByRole('heading', { name: 'Administration' })).toBeInTheDocument();
  });

  test('TC-ST04-01: every section loads its records', async () => {
    const u = userEvent.setup();
    const spy = setup({
      'GET /admin/seller-requests?page=1': () => [200, page([])],
      'POST /admin/books/query': () => [200, page([{ id: 'bk1', title: 'The Silent Orchard', author: 'Meera Iyer', isbn: '9789380000015', category: { name: 'Fiction' } }])],
      'POST /admin/categories/query': () => [200, page([{ id: 'c1', name: 'Fiction', createdAt: '2026-08-01T00:00:00.000Z' }])],
      'POST /admin/listings/query': () => [200, page([{ id: 'l1', book: { title: 'The Silent Orchard' }, seller: { name: 'Kiran Hegde' }, condition: 'New', price: 349, quantity: 5, status: 'Active' }])],
      'POST /admin/reviews/query': () => [200, page([{ id: 'r1', book: { title: 'The Silent Orchard' }, user: { name: 'Pooja Nambiar' }, rating: 4, text: 'Nice', createdAt: '2026-08-01T00:00:00.000Z' }])],
      'POST /admin/orders/query': () => [200, page([{ id: 'o00000000000ORD004', buyer: { name: 'Anita Rao' }, items: [{ quantity: 1 }], totalAmount: 550, status: 'Cancelled', createdAt: '2026-08-01T00:00:00.000Z' }])],
      'GET /admin/audit-log?page=1': () => [200, page([{ id: 'a1', actor: { name: 'Admin User One' }, action: 'suspend', targetType: 'User', targetLabel: 'Vikram Desai', createdAt: '2026-10-01T10:00:00.000Z' }])],
    });
    await openConsole();
    expect(rowFor('Vikram Desai')).toBeInTheDocument();
    expect(lastBody(spy, 'POST', '/admin/users/query')).toEqual({ page: 1, deleted: false });

    await u.click(tab('Sellers'));
    await waitFor(() => expect(lastBody(spy, 'POST', '/admin/users/query')).toEqual({ page: 1, deleted: false, role: 'Seller' }));

    const expectations = [
      ['Seller requests', 'There are no pending seller requests.'],
      ['Books', 'The Silent Orchard'],
      ['Categories', 'Fiction'],
      ['Listings', '₹349.00'],
      ['Reviews', 'Pooja Nambiar'],
      ['Orders', '₹550.00'],
      ['Audit log', 'User: Vikram Desai'],
    ];
    for (const [name, text] of expectations) {
      await u.click(tab(name));
      expect(await screen.findByText(text)).toBeInTheDocument();
    }
  });

  test('tabs can be changed with the arrow keys', async () => {
    const u = userEvent.setup();
    setup({ 'POST /admin/books/query': () => [200, page([])], 'GET /admin/seller-requests?page=1': () => [200, page([])] });
    await openConsole();
    tab('Users').focus();
    await u.keyboard('{ArrowRight}');
    expect(tab('Sellers')).toHaveFocus();
    expect(tab('Sellers')).toHaveAttribute('aria-selected', 'true');
    await u.keyboard('{End}');
    expect(tab('Audit log')).toHaveFocus();
    await u.keyboard('{Home}');
    expect(tab('Users')).toHaveFocus();
  });

  test('TC-ST04-02: suspending a user asks for confirmation, then calls the API and reloads', async () => {
    const u = userEvent.setup();
    const spy = setup({ 'POST /admin/users/b04/suspend': () => [200, { record: {} }] });
    await openConsole();
    expect(within(rowFor('Mohan Rao')).getByRole('button', { name: 'Suspend Mohan Rao' })).toBeInTheDocument();
    expect(within(rowFor('Admin User One (you)')).queryByRole('button', { name: /Suspend/ })).not.toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Suspend Vikram Desai' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Suspend this account?' });
    await u.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText('Done.')).toBeInTheDocument();
    expect(spy.mock.calls.some(([url, o]) => url === '/api/admin/users/b04/suspend' && o.method === 'POST')).toBe(true);
    expect(spy.mock.calls.filter(([url]) => url === '/api/admin/users/query').length).toBeGreaterThanOrEqual(2);
  });

  test('TC-NFR-UI-03: cancelling a delete changes nothing; confirming deletes', async () => {
    const u = userEvent.setup();
    const spy = setup({ 'DELETE /admin/users/b04': () => [200, { record: {} }] });
    await openConsole();
    await u.click(screen.getByRole('button', { name: 'Delete Vikram Desai' }));
    await u.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(spy.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(false);

    await u.click(screen.getByRole('button', { name: 'Delete Vikram Desai' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('can be restored for 30 days');
    await u.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Done.')).toBeInTheDocument();
    expect(spy.mock.calls.some(([url, o]) => url === '/api/admin/users/b04' && o.method === 'DELETE')).toBe(true);
  });

  test('TC-BR5-01: a refused action shows the server reason', async () => {
    const u = userEvent.setup();
    setup({
      'POST /admin/books/query': () => [200, page([{ id: 'bk1', title: 'The Silent Orchard', author: 'Meera Iyer', isbn: '9789380000015' }])],
      'DELETE /admin/books/bk1': () => [409, { error: { message: 'This book has active listings or open orders, so it cannot be deleted. Mark it unavailable instead.' } }],
    });
    await openConsole();
    await u.click(tab('Books'));
    await u.click(await screen.findByRole('button', { name: 'Delete The Silent Orchard' }));
    await u.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Mark it unavailable instead.');
  });

  test('TC-ST04-06: categories are added and renamed', async () => {
    const u = userEvent.setup();
    const spy = setup({
      'POST /admin/categories/query': () => [200, page([{ id: 'c9', name: 'Poetry', createdAt: '2026-10-01T00:00:00.000Z' }])],
      'POST /admin/categories': () => [201, { record: {} }],
      'PATCH /admin/categories/c9': () => [200, { record: {} }],
    });
    await openConsole();
    await u.click(tab('Categories'));
    await u.click(await screen.findByRole('button', { name: 'Add category' }));
    expect(screen.getByText('Category name is required.')).toBeInTheDocument();
    await u.type(screen.getByLabelText(/^New category name/), 'Poetry');
    await u.click(screen.getByRole('button', { name: 'Add category' }));
    await waitFor(() => expect(lastBody(spy, 'POST', '/admin/categories')).toEqual({ name: 'Poetry' }));

    await u.click(screen.getByRole('button', { name: 'Rename Poetry' }));
    const input = within(screen.getByRole('alertdialog')).getByLabelText(/^Category name/);
    expect(input).toHaveValue('Poetry');
    await u.clear(input);
    await u.type(input, 'Poetry and Drama');
    await u.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(lastBody(spy, 'PATCH', '/admin/categories/c9')).toEqual({ name: 'Poetry and Drama' }));
  });

  test('a seller request is rejected only with a reason code', async () => {
    const u = userEvent.setup();
    const spy = setup({
      'GET /admin/seller-requests?page=1': () => [200, page([user('b02', 'Rahul Menon', { sellerRequest: { status: 'Pending', note: 'Rahul Books', requestedAt: '2026-10-01T00:00:00.000Z' } })])],
      'POST /admin/users/b02/seller-request/reject': () => [200, { record: {} }],
    });
    await openConsole();
    await u.click(tab('Seller requests'));
    expect(await screen.findByText('Rahul Books')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Reject Rahul Menon' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Reject this seller request?' });
    await u.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(within(dialog).getByText('Choose a reason.')).toBeInTheDocument();
    await u.selectOptions(within(dialog).getByLabelText(/^Reason/), 'INCD');
    await u.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(lastBody(spy, 'POST', '/admin/users/b02/seller-request/reject')).toEqual({ reasonCode: 'INCD' }));
  });

  test('TC-NFR-SAF-06: deleted records are listed on request and can be restored', async () => {
    const u = userEvent.setup();
    const spy = setup({
      'POST /admin/users/query': (body) => [200, page(body.deleted ? [user('b06', 'Sameer Gupta', { status: 'Deleted', deletedAt: '2026-10-02T00:00:00.000Z' })] : USERS)],
      'POST /admin/users/b06/restore': () => [200, { record: {} }],
    });
    await openConsole();
    await u.click(screen.getByLabelText(/Show deleted records/));
    expect(await screen.findByText('Sameer Gupta')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Deleted on' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Restore Sameer Gupta' }));
    await waitFor(() => expect(spy.mock.calls.some(([url]) => url === '/api/admin/users/b06/restore')).toBe(true));
  });

  test('TC-ST04-08: a record can be viewed in a details dialog', async () => {
    const u = userEvent.setup();
    setup({ 'GET /admin/users/b04': () => [200, { record: user('b04', 'Vikram Desai', { phone: '9000000004' }) }] });
    await openConsole();
    await u.click(screen.getByRole('button', { name: 'View Vikram Desai' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record details' });
    expect(within(dialog).getByText('9000000004')).toBeInTheDocument();
    await u.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('TC-NFR-SEC-19: search terms are sent in the request body, never the URL', async () => {
    const u = userEvent.setup();
    const spy = setup();
    await openConsole();
    await u.type(screen.getByRole('searchbox', { name: 'Search users' }), 'anita.rao@testmail.example{Enter}');
    await waitFor(() => expect(lastBody(spy, 'POST', '/admin/users/query')).toEqual({ page: 1, deleted: false, q: 'anita.rao@testmail.example' }));
    expect(spy.mock.calls.every(([url]) => !url.includes('anita'))).toBe(true);
  });

  test('TC-NFR-QUA-17: the console has no accessibility violations, including with a dialog open', async () => {
    const u = userEvent.setup();
    setup();
    const { container } = renderApp('/admin');
    await screen.findByRole('table');
    expect(await axeViolations(container)).toEqual([]);
    await u.click(screen.getByRole('button', { name: 'Delete Vikram Desai' }));
    expect(await axeViolations(container)).toEqual([]);
  }, 30000);
});

describe('Seller request on the profile', () => {
  const buyer = (extra = {}) => ({ ...user('b01', 'Anita Rao'), addresses: [], ...extra });

  test('a buyer sends a request with an optional note and then sees it pending', async () => {
    const u = userEvent.setup();
    const pending = buyer({ sellerRequest: { status: 'Pending', note: 'Anita Book Corner', requestedAt: '2026-10-03T00:00:00.000Z' } });
    const spy = setup({ 'GET /users/me': () => [200, { user: buyer() }], 'POST /users/me/seller-request': () => [201, { user: pending }] }, buyer());
    renderApp('/profile');
    await u.type(await screen.findByLabelText(/^Note for the administrators/), 'Anita Book Corner');
    await u.click(screen.getByRole('button', { name: 'Request seller account' }));
    expect(await screen.findByText(/Your request has been sent/)).toBeInTheDocument();
    expect(lastBody(spy, 'POST', '/users/me/seller-request')).toEqual({ note: 'Anita Book Corner' });
    expect(screen.queryByRole('button', { name: 'Request seller account' })).not.toBeInTheDocument();
  });

  test('a rejected request shows the reason and allows a new request; sellers do not see the card', async () => {
    const rejected = buyer({ rejectReasonCode: 'INCD', sellerRequest: { status: 'Rejected' } });
    setup({ 'GET /users/me': () => [200, { user: rejected }] }, rejected);
    const { unmount } = renderApp('/profile');
    expect(await screen.findByText(/not approved \(Incomplete details\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request seller account' })).toBeEnabled();
    unmount();
    vi.restoreAllMocks();

    const seller = buyer({ role: 'Seller' });
    setup({ 'GET /users/me': () => [200, { user: seller }] }, seller);
    renderApp('/profile');
    await screen.findByRole('heading', { name: 'Your profile' });
    expect(screen.queryByRole('heading', { name: 'Sell books' })).not.toBeInTheDocument();
  });
});
