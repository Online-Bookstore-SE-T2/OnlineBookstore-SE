import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import CatalogPage from './CatalogPage.jsx';

function response(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const categories = {
  items: [
    { _id: 'cat-1', name: 'Fiction' },
    { _id: 'cat-2', name: 'Science' },
  ],
};

const catalog = {
  items: [
    {
      _id: 'book-1',
      title: 'The Silent Orchard',
      author: 'Anita Sharma',
      isbn: '9781234567890',
      category: { name: 'Fiction' },
      price: 499,
      averageRating: 4,
      reviewCount: 5,
      markedUnavailable: false,
    },
  ],
  page: 1,
  pageSize: 20,
  total: 41,
  totalPages: 3,
};

function LocationDisplay() {
  const location = useLocation();
  return <output aria-label="Current URL">{location.search}</output>;
}

function renderCatalog(initialEntry = '/catalog') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CatalogPage />
      <LocationDisplay />
    </MemoryRouter>
  );
}

function mockApi() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const path = String(url);

    if (path.includes('/books/categories')) {
      return response(categories);
    }

    return response(catalog);
  });
}

describe('Catalog URL state (OSP-80)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('restores filters, sorting and pagination from the URL', async () => {
    const fetchMock = mockApi();

    renderCatalog(
      '/catalog?category=cat-1&minPrice=100&maxPrice=500&minRating=4&available=false&sort=price_desc&page=2'
    );

    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();

    expect(screen.getByLabelText('Category')).toHaveValue('cat-1');
    expect(screen.getByLabelText('Minimum price')).toHaveValue(100);
    expect(screen.getByLabelText('Maximum price')).toHaveValue(500);
    expect(screen.getByLabelText('Minimum rating')).toHaveValue('4');
    expect(screen.getByLabelText('Availability')).toHaveValue('false');
    expect(screen.getByLabelText('Sort by')).toHaveValue('price_desc');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/books?'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    const catalogRequest = fetchMock.mock.calls
      .map(([url]) => String(url))
      .find((url) => url.includes('/api/books?'));

    const params = new URL(catalogRequest, 'http://localhost').searchParams;
    expect(params.get('category')).toBe('cat-1');
    expect(params.get('minPrice')).toBe('100');
    expect(params.get('maxPrice')).toBe('500');
    expect(params.get('minRating')).toBe('4');
    expect(params.get('available')).toBe('false');
    expect(params.get('sort')).toBe('price_desc');
    expect(params.get('page')).toBe('2');
  });

  it('updates the URL when filters change and resets pagination', async () => {
    const user = userEvent.setup();
    mockApi();

    renderCatalog('/catalog?page=3&sort=title_desc');

    expect(await screen.findByText('Page 3 of 3')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Category'), 'cat-2');

    await waitFor(() => {
      const url = screen.getByLabelText('Current URL').textContent;
      const params = new URLSearchParams(url);
      expect(params.get('category')).toBe('cat-2');
      expect(params.has('page')).toBe(false);
    });

    await user.selectOptions(screen.getByLabelText('Sort by'), 'price_asc');

    await waitFor(() => {
      const params = new URLSearchParams(
        screen.getByLabelText('Current URL').textContent
      );
      expect(params.get('sort')).toBe('price_asc');
      expect(params.get('category')).toBe('cat-2');
      expect(params.has('page')).toBe(false);
    });
  });

  it('updates the URL when navigating between pages', async () => {
    const user = userEvent.setup();
    mockApi();

    renderCatalog('/catalog?sort=price_desc&page=2');

    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      const params = new URLSearchParams(
        screen.getByLabelText('Current URL').textContent
      );
      expect(params.get('page')).toBe('3');
      expect(params.get('sort')).toBe('price_desc');
    });

    await user.click(screen.getByRole('button', { name: 'Previous' }));

    await waitFor(() => {
      const params = new URLSearchParams(
        screen.getByLabelText('Current URL').textContent
      );
      expect(params.get('page')).toBe('2');
    });
  });

  it('clears all catalog query parameters', async () => {
    const user = userEvent.setup();
    mockApi();

    renderCatalog(
      '/catalog?category=cat-1&minPrice=100&sort=price_desc&page=2'
    );

    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Current URL').textContent).toBe('');
    });

    expect(screen.getByLabelText('Category')).toHaveValue('');
    expect(screen.getByLabelText('Minimum price')).toHaveValue(null);
    expect(screen.getByLabelText('Sort by')).toHaveValue('title_asc');
  });
});
