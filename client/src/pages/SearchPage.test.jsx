import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SearchPage } from './SearchPage.jsx';

function renderSearchPage() {
  return render(
    <MemoryRouter>
      <SearchPage />
    </MemoryRouter>
  );
}

function response(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function mockSearchResponse(items, overrides = {}) {
  return {
    items,
    page: 1,
    pageSize: 20,
    total: items.length,
    totalPages: 1,
    ...overrides,
  };
}

const book = {
  _id: 'book-1',
  title: 'The Silent Orchard',
  author: 'Anita Sharma',
  isbn: '9781234567890',
  category: {
    name: 'Fiction',
  },
  price: 499,
};

describe('Search Books (OSP-9)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads books when the Search Books page opens', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response(mockSearchResponse([book]))
      );

    renderSearchPage();

    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'The Silent Orchard',
      })
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/books/search?page=1',
      expect.objectContaining({
        method: 'GET',
      })
    );
  });

  it('searches by title and displays matching books', async () => {
    const user = userEvent.setup();

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response(mockSearchResponse([]))
      )
      .mockResolvedValueOnce(
        response(mockSearchResponse([book]))
      );

    renderSearchPage();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const searchBox = screen.getByRole('searchbox');

    await user.type(searchBox, 'Silent Orchard');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'The Silent Orchard',
      })
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/books/search?q=Silent+Orchard&page=1',
      expect.objectContaining({
        method: 'GET',
      })
    );

    expect(screen.getByText('Anita Sharma')).toBeInTheDocument();
    expect(screen.getByText('9781234567890')).toBeInTheDocument();
  });

  it('searches by author', async () => {
    const user = userEvent.setup();

    const authorBook = {
      ...book,
      title: 'Database Systems',
      author: 'Ravi Kumar',
    };

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response(mockSearchResponse([]))
      )
      .mockResolvedValueOnce(
        response(mockSearchResponse([authorBook]))
      );

    renderSearchPage();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const searchBox = screen.getByRole('searchbox');

    await user.type(searchBox, 'Ravi Kumar');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'Database Systems',
      })
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/books/search?q=Ravi+Kumar&page=1',
      expect.objectContaining({
        method: 'GET',
      })
    );
  });

  it('searches by ISBN', async () => {
    const user = userEvent.setup();

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response(mockSearchResponse([]))
      )
      .mockResolvedValueOnce(
        response(mockSearchResponse([book]))
      );

    renderSearchPage();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const searchBox = screen.getByRole('searchbox');

    await user.type(searchBox, '9781234567890');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'The Silent Orchard',
      })
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/books/search?q=9781234567890&page=1',
      expect.objectContaining({
        method: 'GET',
      })
    );
  });

  it('shows a message when no books match the search', async () => {
    const user = userEvent.setup();

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response(mockSearchResponse([]))
      )
      .mockResolvedValueOnce(
        response(mockSearchResponse([]))
      );

    renderSearchPage();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const searchBox = screen.getByRole('searchbox');

    await user.type(searchBox, 'Book That Does Not Exist');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(
      await screen.findByText('No books found.')
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/books/search?q=Book+That+Does+Not+Exist&page=1',
      expect.objectContaining({
        method: 'GET',
      })
    );
  });

  it('supports pagination when multiple pages are returned', async () => {
    const user = userEvent.setup();

    const firstPage = mockSearchResponse([book], {
      total: 21,
      totalPages: 2,
    });

    const secondBook = {
      ...book,
      _id: 'book-2',
      title: 'Advanced Databases',
    };

    const secondPage = mockSearchResponse([secondBook], {
      page: 2,
      total: 21,
      totalPages: 2,
    });

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(firstPage))
      .mockResolvedValueOnce(response(secondPage));

    renderSearchPage();

    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'The Silent Orchard',
      })
    ).toBeInTheDocument();

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(
      await screen.findByRole('heading', {
        level: 3,
        name: 'Advanced Databases',
      })
    ).toBeInTheDocument();

    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/books/search?page=2',
      expect.objectContaining({
        method: 'GET',
      })
    );
  });
});