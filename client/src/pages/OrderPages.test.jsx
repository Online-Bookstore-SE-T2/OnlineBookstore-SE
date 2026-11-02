import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SellerOrdersPage } from './OrderPages.jsx';
import { advanceSellerOrder, listSellerOrders } from '../api/orders.js';

vi.mock('../api/orders.js', () => ({
  advanceSellerOrder: vi.fn(),
  cancelOrder: vi.fn(),
  getOrder: vi.fn(),
  listOrders: vi.fn(),
  listSellerOrders: vi.fn(),
}));

describe('SellerOrdersPage', () => {
  let status;
  const order = {
    id: 'order-123',
    buyer: { name: 'Anita Rao' },
    deliveryAddress: {
      line: 'Flat 12, Lakeview Apartments',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560011',
    },
    items: [{ listing: 'listing-1', title: 'Seller’s copy', quantity: 1, unitPrice: 349 }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    status = 'Paid';
    listSellerOrders.mockImplementation(async () => [{ ...order, status }]);
    advanceSellerOrder.mockImplementation(async (_id, nextStatus) => {
      status = nextStatus;
      return { ...order, status };
    });
  });

  it('shows delivery details without buyer email and advances through the order transitions', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/seller/orders']}>
        <Routes>
          <Route path="/seller/orders" element={<SellerOrdersPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Seller’s copy')).toBeInTheDocument();
    const address = document.querySelector('address');
    expect(address).toHaveTextContent('Flat 12, Lakeview Apartments');
    expect(address).toHaveTextContent('Bengaluru, Karnataka 560011');
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mark shipped' }));
    expect(await screen.findByRole('button', { name: 'Mark delivered' })).toBeInTheDocument();
    expect(advanceSellerOrder).toHaveBeenLastCalledWith('order-123', 'Shipped');

    await user.click(screen.getByRole('button', { name: 'Mark delivered' }));
    await waitFor(() => expect(advanceSellerOrder).toHaveBeenLastCalledWith('order-123', 'Delivered'));
    expect(await screen.findByText('Delivered')).toBeInTheDocument();
  });

});
