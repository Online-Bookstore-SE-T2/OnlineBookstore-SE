import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, vi } from 'vitest';
import { renderApp } from '../test/render.jsx';
import { mockApi } from '../test/fetchMock.js';
import { setToken } from '../api/http.js';

const BUYER = { id: 'buyer-1', name: 'Anita Rao', email: 'anita@example.test', role: 'Buyer', status: 'Active' };
const notice = {
  id: 'notice-1',
  type: 'ORDER_STATUS_CHANGED',
  title: 'Order status updated',
  message: 'Your order is now Shipped.',
  relatedOrder: { id: 'order-1', status: 'Shipped' },
  readAt: null,
  createdAt: '2026-10-29T08:00:00.000Z',
};

afterEach(() => vi.restoreAllMocks());

test('lists the related order and marks a notification as read', async () => {
  const user = userEvent.setup();
  setToken('h.p.s');
  let unread = true;
  const api = mockApi({
    'GET /auth/session': () => [200, { user: BUYER }],
    'GET /cart': () => [200, { cart: { items: [], itemCount: 0, subtotal: 0 } }],
    'GET /notifications?unreadOnly=true': () => [200, { notifications: unread ? [notice] : [] }],
    'GET /notifications': () => [200, { notifications: unread ? [notice] : [{ ...notice, readAt: '2026-10-29T08:01:00.000Z' }] }],
    'PATCH /notifications/notice-1/read': () => {
      unread = false;
      return [200, { notification: { ...notice, readAt: '2026-10-29T08:01:00.000Z' } }];
    },
  });

  renderApp('/notifications');
  await waitFor(
    () => expect(api.mock.calls.some(([url]) => url === '/api/notifications')).toBe(true),
    { timeout: 10000 },
  );
  expect(await screen.findByRole('link', { name: 'View related order' }, { timeout: 10000 }))
    .toHaveAttribute('href', '/orders/order-1');
  await user.click(screen.getByRole('button', { name: 'Mark as read' }));
  expect(await screen.findByText(/Order status updated/)).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument());
});
