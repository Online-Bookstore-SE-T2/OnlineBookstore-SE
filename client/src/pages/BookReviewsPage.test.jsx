import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BookReviewsPage from './BookReviewsPage.jsx';
import { apiRequest } from '../api/http.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { axeViolations } from '../test/a11y.js';

vi.mock('../api/http.js', () => ({ apiRequest: vi.fn(), ApiError: class ApiError extends Error {} }));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

const bookReviews = {
  book: { title: 'The Silent Orchard', author: 'Anita Sharma', averageRating: 4.5, reviewCount: 1 },
  reviews: [{ id: 'review-1', rating: 5, user: { name: 'Riya' }, text: 'A lovely book.', createdAt: '2026-01-10T00:00:00.000Z' }],
};

function renderReviews() {
  return render(
    <MemoryRouter initialEntries={['/books/book-1/reviews']}>
      <main><Routes><Route path="/books/:bookId/reviews" element={<BookReviewsPage />} /></Routes></main>
    </MemoryRouter>,
  );
}

describe('BookReviewsPage usability and accessibility (NFR08, NFR11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 812 });
    useAuth.mockReturnValue({ user: { id: 'reader-1', name: 'Reader' } });
    apiRequest.mockImplementation((path) => {
      if (path.endsWith('/mine')) return Promise.resolve({ review: null });
      return Promise.resolve(bookReviews);
    });
  });

  it('provides labelled review controls and has no axe violations at mobile width', async () => {
    renderReviews();

    await screen.findByRole('heading', { name: 'Reviews for The Silent Orchard' });
    expect(screen.getByRole('combobox', { name: 'Rating' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /review/i })).toBeInTheDocument();
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('posts a review using only keyboard controls', async () => {
    const user = userEvent.setup();
    renderReviews();

    const rating = await screen.findByRole('combobox', { name: 'Rating' });
    rating.focus();
    expect(rating).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: /review/i })).toHaveFocus();
    await user.type(screen.getByRole('textbox', { name: /review/i }), 'Clear and engaging.');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Post review' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('status')).toHaveTextContent('Your review has been posted.');
    expect(apiRequest).toHaveBeenCalledWith('/books/book-1/reviews', {
      method: 'POST', body: { rating: 5, text: 'Clear and engaging.' },
    });
  });

  it('keeps the review form keyboard-operable when editing an existing review', async () => {
    const user = userEvent.setup();
    apiRequest.mockImplementation((path) => {
      if (path.endsWith('/mine')) return Promise.resolve({ review: { rating: 3, text: 'Good.' } });
      return Promise.resolve(bookReviews);
    });
    renderReviews();

    expect(await screen.findByRole('heading', { name: 'Edit your review' })).toBeInTheDocument();
    const rating = screen.getByRole('combobox', { name: 'Rating' });
    rating.focus();
    expect(rating).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: /review/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Update review' })).toHaveFocus();
  });
});
