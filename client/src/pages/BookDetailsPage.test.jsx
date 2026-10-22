import { render, screen } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { apiRequest } from '../api/http.js';
import BookDetailsPage from './BookDetailsPage.jsx';

vi.mock('../api/http.js', () => ({
  apiRequest: vi.fn(),
}));

const bookDetails = {
  book: {
    _id: 'book-1',
    title: 'The Silent Orchard',
    author: 'Anita Sharma',
    isbn: '9781234567890',
    category: { name: 'Fiction' },
    price: 499,
    description: 'A story about family and belonging.',
    coverImageUrl: 'https://example.com/cover.jpg',
    markedUnavailable: false,
  },
  rating: {
    average: 4.5,
    count: 2,
  },
  reviews: [
    {
      id: 'review-1',
      rating: 5,
      reviewer: 'Riya',
      text: 'A wonderful book!',
      createdAt: '2026-01-10T00:00:00.000Z',
    },
  ],
};

function renderBookDetails(bookId = 'book-1') {
  return render(
    <MemoryRouter initialEntries={[`/books/${bookId}`]}>
      <Routes>
        <Route path="/books/:bookId" element={<BookDetailsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('View Book Details (OSP-11)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows the loading message while details are being fetched', () => {
    apiRequest.mockReturnValue(new Promise(() => {}));

    renderBookDetails();

    expect(screen.getByText('Loading book details...')).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith('/books/book-1');
  });

  it('displays book information, price, rating and reviews', async () => {
    apiRequest.mockResolvedValue(bookDetails);

    renderBookDetails();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'The Silent Orchard',
      })
    ).toBeInTheDocument();

    expect(screen.getByText('Anita Sharma')).toBeInTheDocument();
    expect(screen.getByText('9781234567890')).toBeInTheDocument();
    expect(screen.getByText('Fiction')).toBeInTheDocument();
    expect(screen.getByText('₹499.00')).toBeInTheDocument();
    expect(screen.getByText('A story about family and belonging.')).toBeInTheDocument();
    expect(screen.getByText(/4\.5 \/ 5/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Customer reviews' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Riya' })).toBeInTheDocument();
    expect(screen.getByText('A wonderful book!')).toBeInTheDocument();

    expect(apiRequest).toHaveBeenCalledWith('/books/book-1');
  });

  it('shows an empty state when the book has no reviews', async () => {
    apiRequest.mockResolvedValue({
      ...bookDetails,
      rating: { average: 0, count: 0 },
      reviews: [],
    });

    renderBookDetails();

    expect(
      await screen.findByText(
        'No reviews have been submitted for this book yet.'
      )
    ).toBeInTheDocument();
  });

  it('shows an error message when the API request fails', async () => {
    apiRequest.mockRejectedValue(new Error('Unable to connect to server'));

    renderBookDetails();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Book details unavailable',
      })
    ).toBeInTheDocument();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to connect to server'
    );
    expect(
      screen.getByRole('link', { name: 'Back to catalog' })
    ).toHaveAttribute('href', '/');
  });

  it('shows fallback text for missing optional book information', async () => {
    apiRequest.mockResolvedValue({
      book: {
        title: 'Untitled Journey',
        author: 'Unknown Author',
        isbn: '1234567890123',
        category: null,
        price: null,
        description: '',
        markedUnavailable: true,
      },
      rating: { average: 0, count: 0 },
      reviews: [],
    });

    renderBookDetails();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Untitled Journey',
      })
    ).toBeInTheDocument();

    expect(screen.getByText('Uncategorised')).toBeInTheDocument();
    expect(screen.getByText('Not listed')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText('No description is available yet.')).toBeInTheDocument();
  });

  it('requests details for the book ID in the URL', async () => {
    apiRequest.mockResolvedValue(bookDetails);

    renderBookDetails('book-42');

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'The Silent Orchard',
      })
    ).toBeInTheDocument();

    expect(apiRequest).toHaveBeenCalledWith('/books/book-42');
  });
});
