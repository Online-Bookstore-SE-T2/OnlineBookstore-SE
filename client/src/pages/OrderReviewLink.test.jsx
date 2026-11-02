import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OrderDetailPage } from './OrderPages.jsx';
import { getOrder } from '../api/orders.js';

vi.mock('../api/orders.js', () => ({
  advanceSellerOrder: vi.fn(),
  cancelOrder: vi.fn(),
  getOrder: vi.fn(),
  listOrders: vi.fn(),
  listSellerOrders: vi.fn(),
}));

describe('review link after delivery', () => {
  const order = {
    id: 'order-123',
    createdAt: '2026-11-02T00:00:00.000Z',
    deliveryAddress: {},
    items: [{ book: { id: 'book-1' }, title: 'The Silent Orchard', quantity: 1, unitPrice: 349 }],
  };

  beforeEach(() => vi.clearAllMocks());

  function renderOrder() {
    return render(
      <MemoryRouter initialEntries={['/orders/order-123']}>
        <Routes>
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('shows the review link after delivery and hides it before delivery', async () => {
    getOrder.mockResolvedValue({ ...order, status: 'Shipped' });
    const shipped = renderOrder();
    await screen.findByRole('heading', { name: 'Order details' });
    expect(screen.queryByRole('link', { name: 'Review The Silent Orchard' })).not.toBeInTheDocument();

    shipped.unmount();
    getOrder.mockResolvedValue({ ...order, status: 'Delivered' });
    renderOrder();
    expect(await screen.findByRole('link', { name: 'Review The Silent Orchard' })).toHaveAttribute(
      'href',
      '/books/book-1/reviews',
    );
  });
});
