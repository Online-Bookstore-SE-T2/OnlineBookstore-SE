import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SellerListingsPage from './SellerListingsPage.jsx';
import { apiRequest } from '../api/http.js';
import { axeViolations } from '../test/a11y.js';

vi.mock('../api/http.js', () => ({ apiRequest: vi.fn() }));

describe('SellerListingsPage usability and accessibility (NFR03, NFR08, NFR11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
    apiRequest.mockResolvedValue({ listings: [] });
  });

  it('publishes a new listing in no more than five keyboard-accessible steps', async () => {
    const user = userEvent.setup();
    render(<main><SellerListingsPage /></main>);

    const isbn = await screen.findByRole('textbox', { name: /catalog isbn-13/i });
    const price = screen.getByRole('spinbutton', { name: /price \(inr\)/i });
    const publish = screen.getByRole('button', { name: 'Publish listing' });

    let steps = 0;
    await user.type(isbn, '9781234567890');
    steps += 1;
    await user.type(price, '24.99');
    steps += 1;
    await user.tab(); // quantity is already 1
    await user.tab(); // condition is already Good
    await user.tab(); // optional notes
    await user.tab(); // publish
    expect(publish).toHaveFocus();
    await user.keyboard('{Enter}');
    steps += 1;

    expect(steps).toBeLessThanOrEqual(5);
    expect(await screen.findByRole('status')).toHaveTextContent('Book listed for sale.');
    expect(apiRequest).toHaveBeenCalledWith('/listings', {
      method: 'POST',
      body: { isbn: '9781234567890', price: 24.99, quantity: 1, condition: 'Good', notes: '' },
    });
  });

  it('exposes labelled controls and passes axe checks at a mobile viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 812 });
    render(<main><SellerListingsPage /></main>);
    await screen.findByRole('heading', { name: 'Sell a book' });

    expect(screen.getByRole('textbox', { name: /catalog isbn-13/i })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /price \(inr\)/i })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Condition' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /notes/i })).toBeInTheDocument();
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('supports keyboard editing and cancelling a listing', async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValueOnce({ listings: [{
      id: 'listing-1', book: { title: 'The Silent Orchard', author: 'Anita Sharma', isbn: '9781234567890' },
      price: 24.99, quantity: 2, condition: 'Good', notes: '',
    }] });
    render(<main><SellerListingsPage /></main>);

    const edit = await screen.findByRole('button', { name: 'Edit' });
    edit.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { name: 'Edit listing' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /catalog isbn-13/i })).not.toBeInTheDocument();
    const price = screen.getByRole('spinbutton', { name: /price \(inr\)/i });
    expect(price).toHaveValue(24.99);
    const cancel = screen.getByRole('button', { name: 'Cancel edit' });
    cancel.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { name: 'Sell a book' })).toBeInTheDocument();
  });
});
