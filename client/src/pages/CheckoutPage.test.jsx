import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, vi } from 'vitest';
import { renderApp } from '../test/render.jsx';
import { lastBody, mockApi } from '../test/fetchMock.js';
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

// REQ-11 with Razorpay Checkout (test mode). window.Razorpay is replaced by a recording fake.
describe('checkout page with Razorpay', () => {
  const ORDER = {
    id: 'order-1', status: 'Placed', totalAmount: 550, deliveryCharge: 0, createdAt: '2026-11-11T10:00:00.000Z',
    items: [{ listing: 'listing-1', title: 'The Silent Orchard', quantity: 1, unitPrice: 550 }],
    deliveryAddress: ADDRESS, statusHistory: [], payment: { status: 'Pending' },
  };
  const CHECKOUT = {
    address: ADDRESS,
    items: [{ listingId: 'listing-1', title: 'The Silent Orchard', quantity: 1, unitPrice: 550, subtotal: 550, available: true }],
    subtotal: 550, deliveryCharge: 0, totalAmount: 550,
  };
  let instances;

  beforeEach(() => {
    instances = [];
    window.Razorpay = class {
      constructor(options) { this.options = options; this.events = {}; instances.push(this); }
      on(event, handler) { this.events[event] = handler; }
      open() { this.opened = true; }
    };
  });
  afterEach(() => { delete window.Razorpay; });

  function routes(extra = {}) {
    return {
      ...baseRoutes(CHECKOUT),
      'GET /payments/config': () => [200, { payment: { provider: 'razorpay', keyId: 'rzp_test_clientkey' } }],
      'POST /checkout/orders': () => [201, { order: ORDER }],
      'POST /payments/orders/order-1/intent': () => [201, { intent: { transactionRef: 'order_RZP1234567', amount: 55000, currency: 'INR' } }],
      ...extra,
    };
  }

  async function openRazorpay() {
    const user = userEvent.setup();
    renderApp('/checkout');
    await user.click(await screen.findByRole('button', { name: 'Place order and pay' }, { timeout: 10000 }));
    await user.click(await screen.findByRole('button', { name: 'Pay with Razorpay' }));
    await waitFor(() => expect(instances).toHaveLength(1));
    return instances[0];
  }

  test('opens Razorpay for the server-created order and confirms a signed payment', async () => {
    setToken('h.p.s');
    const api = mockApi(routes({
      'POST /payments/orders/order-1/confirm': () => [200, { order: { ...ORDER, status: 'Paid', payment: { provider: 'razorpay', status: 'Paid' } } }],
      'GET /orders/order-1': () => [200, { order: { ...ORDER, status: 'Paid', payment: { provider: 'razorpay', status: 'Paid' } } }],
    }));

    const checkout = await openRazorpay();

    expect(checkout.opened).toBe(true);
    expect(checkout.options).toMatchObject({
      key: 'rzp_test_clientkey', order_id: 'order_RZP1234567', amount: 55000, currency: 'INR',
      prefill: { name: BUYER.name, email: BUYER.email },
    });
    await act(async () => {
      await checkout.options.handler({ razorpay_order_id: 'order_RZP1234567', razorpay_payment_id: 'pay_RZP1234567', razorpay_signature: 'signed' });
    });
    expect(lastBody(api, 'POST', '/payments/orders/order-1/confirm')).toEqual({
      transactionRef: 'order_RZP1234567', paymentId: 'pay_RZP1234567', signature: 'signed',
    });
    expect(await screen.findByRole('heading', { name: 'Order confirmation' })).toBeInTheDocument();
  });

  test('a failed payment followed by closing Razorpay cancels the order and says the stock was released', async () => {
    setToken('h.p.s');
    const cancelled = { ...ORDER, status: 'Cancelled', payment: { provider: 'razorpay', status: 'Failed', failureReason: 'Payment declined by bank' } };
    const api = mockApi(routes({
      'POST /payments/orders/order-1/confirm': () => [200, { order: cancelled }],
      'GET /orders/order-1': () => [200, { order: cancelled }],
    }));

    const checkout = await openRazorpay();
    act(() => checkout.events['payment.failed']({ error: { description: 'Payment declined by bank' } }));
    expect(await screen.findByText(/Payment declined by bank/)).toBeInTheDocument();
    await act(async () => { await checkout.options.modal.ondismiss(); });

    expect(lastBody(api, 'POST', '/payments/orders/order-1/confirm')).toEqual({ transactionRef: 'order_RZP1234567', failure: true });
    expect(await screen.findByText('Payment was not completed; the reserved stock was released.')).toBeInTheDocument();
  });

  test('closing Razorpay without trying to pay keeps the order waiting and lets the buyer reopen it', async () => {
    setToken('h.p.s');
    const api = mockApi(routes());

    const checkout = await openRazorpay();
    await act(async () => { await checkout.options.modal.ondismiss(); });

    expect(lastBody(api, 'POST', '/payments/orders/order-1/confirm')).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Pay with Razorpay' })).toBeEnabled();
  });
});
