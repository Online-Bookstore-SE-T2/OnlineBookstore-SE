
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api/http.js';

const DEFAULT_FILTERS = {
  category: '',
  minPrice: '',
  maxPrice: '',
  minRating: '',
  availability: '',
  sort: 'title_asc',
};

export default function CatalogPage() {
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();

  // The query string is the single source of truth for shareable catalog state.
  // useMemo keeps the filters object stable until the URL actually changes.
  const queryString = searchParams.toString();
  const { filters, page } = useMemo(() => {
    const params = new URLSearchParams(queryString);
    const allowedSorts = new Set([
      'title_asc', 'title_desc', 'price_asc',
      'price_desc', 'rating_desc', 'newest',
    ]);
    const requestedSort = params.get('sort') || DEFAULT_FILTERS.sort;
    const requestedPage = Number(params.get('page') || '1');

    return {
      filters: {
        category: params.get('category') || '',
        minPrice: params.get('minPrice') || '',
        maxPrice: params.get('maxPrice') || '',
        minRating: params.get('minRating') || '',
        availability: params.get('available') || '',
        sort: allowedSorts.has(requestedSort)
          ? requestedSort
          : DEFAULT_FILTERS.sort,
      },
      page: Number.isInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1,
    };
  }, [queryString]);

  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function updateFilter(name, value) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);

      if (value === '' || (name === 'sort' && value === DEFAULT_FILTERS.sort)) {
        next.delete(name === 'availability' ? 'available' : name);
      } else {
        next.set(name === 'availability' ? 'available' : name, value);
      }

      // Any filter change returns the user to the first result page.
      next.delete('page');
      return next;
    });
  }

  function changePage(nextPage) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (nextPage <= 1) next.delete('page');
      else next.set('page', String(nextPage));
      return next;
    });
  }

  function clearFilters() {
    setSearchParams({});
  }

  useEffect(() => {
    let cancelled = false;

    async function loadCategories() {
      try {
        const data = await apiRequest('/books/categories');
        if (!cancelled) setCategories(data.items || []);
      } catch {
        if (!cancelled) setCategories([]);
      }
    }

    loadCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadBooks() {
      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('sort', filters.sort);

        if (filters.category) params.set('category', filters.category);
        if (filters.minPrice !== '') params.set('minPrice', filters.minPrice);
        if (filters.maxPrice !== '') params.set('maxPrice', filters.maxPrice);
        if (filters.minRating !== '') params.set('minRating', filters.minRating);
        if (filters.availability !== '') params.set('available', filters.availability);

        const data = await apiRequest(`/books?${params.toString()}`);

        if (!cancelled) {
          setBooks(data.items || []);
          setTotal(data.total || 0);
          setTotalPages(data.totalPages || 0);
        }
      } catch (err) {
        if (!cancelled) {
          setBooks([]);
          setTotal(0);
          setTotalPages(0);
          setError(err?.message || 'Unable to load the book catalog.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadBooks();

    return () => {
      cancelled = true;
    };
  }, [page, filters]);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1>Online Bookstore</h1>
        <p>Discover books and find your next favourite read.</p>
      </header>

      <section
        aria-label="Catalog filters"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          alignItems: 'end',
          padding: '20px',
          marginBottom: '24px',
          border: '1px solid #ddd',
          borderRadius: '10px',
        }}
      >
        <label>
          Category<br />
          <select
            value={filters.category}
            onChange={(event) => updateFilter('category', event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category._id} value={category._id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Minimum price<br />
          <input
            type="number"
            min="0"
            placeholder="₹ Min"
            value={filters.minPrice}
            onChange={(event) => updateFilter('minPrice', event.target.value)}
          />
        </label>

        <label>
          Maximum price<br />
          <input
            type="number"
            min="0"
            placeholder="₹ Max"
            value={filters.maxPrice}
            onChange={(event) => updateFilter('maxPrice', event.target.value)}
          />
        </label>

        <label>
          Minimum rating<br />
          <select
            value={filters.minRating}
            onChange={(event) => updateFilter('minRating', event.target.value)}
          >
            <option value="">Any rating</option>
            <option value="1">1+ stars</option>
            <option value="2">2+ stars</option>
            <option value="3">3+ stars</option>
            <option value="4">4+ stars</option>
            <option value="5">5 stars</option>
          </select>
        </label>

        <label>
          Availability<br />
          <select
            value={filters.availability}
            onChange={(event) => updateFilter('availability', event.target.value)}
          >
            <option value="">All books</option>
            <option value="true">Available</option>
            <option value="false">Unavailable</option>
          </select>
        </label>

        <label>
          Sort by<br />
          <select
            value={filters.sort}
            onChange={(event) => updateFilter('sort', event.target.value)}
          >
            <option value="title_asc">Title: A–Z</option>
            <option value="title_desc">Title: Z–A</option>
            <option value="price_asc">Price: Low to high</option>
            <option value="price_desc">Price: High to low</option>
            <option value="rating_desc">Highest rated</option>
            <option value="newest">Newest first</option>
          </select>
        </label>

        <button type="button" onClick={clearFilters}>
          Clear filters
        </button>
      </section>

      <section aria-label="Book results">
        <p>
          {loading ? 'Loading books...' : `${total} book${total === 1 ? '' : 's'} found`}
        </p>

        {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}

        {!loading && !error && books.length === 0 && (
          <p>No books found. Try changing your filters.</p>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
            gap: '20px',
          }}
        >
          {books.map((book) => (
            <article
              key={book._id}
              style={{
                border: '1px solid #ddd',
                borderRadius: '10px',
                padding: '16px',
                overflowWrap: 'anywhere',
              }}
            >
              {book.coverImageUrl && (
                <img
                  src={book.coverImageUrl}
                  alt={`Cover of ${book.title}`}
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: '220px',
                    objectFit: 'contain',
                    marginBottom: '12px',
                  }}
                />
              )}

              <h2 style={{ fontSize: '1.1rem' }}>{book.title}</h2>
              <p><strong>Author:</strong> {book.author || 'Unknown'}</p>
              {book.isbn && <p><strong>ISBN:</strong> {book.isbn}</p>}
              <p><strong>Category:</strong> {book.category?.name || 'Uncategorised'}</p>
              {book.description && <p>{book.description}</p>}

              <p>
                <strong>Price:</strong>{' '}
                {book.price != null ? `₹${Number(book.price).toFixed(2)}` : 'Not listed'}
              </p>

              <p>
                <strong>Rating:</strong>{' '}
                {book.averageRating != null ? `${book.averageRating} / 5` : 'No ratings yet'}
                {book.reviewCount != null && ` (${book.reviewCount} reviews)`}
              </p>

              <p>
                <strong>Status:</strong>{' '}
                {book.markedUnavailable ? 'Unavailable' : 'Check listing availability'}
              </p>

              <Link to={`/books/${book._id}`}>View Details</Link>
            </article>
          ))}
        </div>
      </section>

      {totalPages > 1 && (
        <nav
          aria-label="Catalog pagination"
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '16px',
            marginTop: '28px',
          }}
        >
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => changePage(page - 1)}
          >
            Previous
          </button>

          <span>Page {page} of {totalPages}</span>

          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => changePage(page + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
