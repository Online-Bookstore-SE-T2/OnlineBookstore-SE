import { screen, waitFor } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { renderApp } from '../test/render.jsx';
import { mockApi } from '../test/fetchMock.js';
import { setToken } from '../api/http.js';

const BUYER = { id: 'buyer-1', name: 'Anita Rao', email: 'anita@example.test', role: 'Buyer', status: 'Active' };
const ADDRESS = { id: 'address-1', line: '12 Demo Street', city: 'Bengaluru', state: 'Karnataka', postalCode: '560011', isDefault: true };

function baseRoutes(checkout) {
  return {
    'GET /auth/session': () => [200, { user: BUYER }],
    'GET /cart': () => [200, { cart: { items: [], itemCount: 0, subtotal: 0 } }],
    'GET /notifications?unreadOnly=true': () => [200, { notifications: [] }],
    'GET /users/me/addresses': () => [200, { addresses: [ADDRESS] }],
    'GET /payments/config': () => [200, { payment: { provider: 'simulator', publishableKey: null } }],
    'POST /checkout/validate': () => [200, { checkout }],
  };
}

afterEach(() => vi.restoreAllMocks());

describe('checkout page', () => {
  test('flags unavailable stock inline and prevents order placement', async () => {
    setToken('h.p.s');
    mockApi(baseRoutes({
      address: ADDRESS,
      items: [{
        listingId: 'listing-1',
        title: 'The Silent Orchard',
        quantity: 3,
        unitPrice: 349,
        subtotal: 0,
        available: false,
        unavailableReason: 'Only 1 item(s) remain in stock.',
      }],
      subtotal: 0,
      deliveryCharge: 0,
      totalAmount: 0,
    }));

    renderApp('/checkout');
    expect(await screen.findByText('The Silent Orchard', {}, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Only 1 item(s) remain in stock.');
    expect(screen.getByRole('button', { name: 'Place order and pay' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove from cart' })).toBeInTheDocument();
  });

  test('requires a saved delivery address and links to address management', async () => {
    setToken('h.p.s');
    mockApi({
      ...baseRoutes({ address: null, items: [], subtotal: 0, deliveryCharge: 0, totalAmount: 0 }),
      'GET /users/me/addresses': () => [200, { addresses: [] }],
    });

    renderApp('/checkout');
    await waitFor(
      () => expect(screen.getByRole('link', { name: 'Manage delivery addresses' })).toBeInTheDocument(),
      { timeout: 10000 },
    );
  });
});
