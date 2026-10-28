
import { useEffect, useState } from 'react';
import { apiRequest } from '../api/http.js';
import BookCard from '../components/BookCard.jsx';
import { Burst } from '../components/Icons.jsx';
import PageNav from '../components/PageNav.jsx';

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
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  function updateFilter(name, value) {
    setFilters((previous) => ({
      ...previous,
      [name]: value,
    }));
    setPage(1);
  }

  function clearFilters() {
    setFilters({ ...DEFAULT_FILTERS });
    setPage(1);
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

  const categoryName = categories.find((category) => category._id === filters.category)?.name;

  // Applied filters are repeated above the results as removable chips, so shoppers can see
  // why the list is short without scrolling back to the sidebar.
  const activeFilters = [
    filters.category && { key: 'category', label: categoryName || 'Category' },
    filters.minPrice !== '' && { key: 'minPrice', label: `From ₹${filters.minPrice}` },
    filters.maxPrice !== '' && { key: 'maxPrice', label: `Up to ₹${filters.maxPrice}` },
    filters.minRating !== '' && { key: 'minRating', label: `${filters.minRating}+ stars` },
    filters.availability !== '' && {
      key: 'availability',
      label: filters.availability === 'true' ? 'Available' : 'Unavailable',
    },
  ].filter(Boolean);

  function radio(name, value, label) {
    return (
      <label className="choice" key={value || 'any'}>
        <input
          type="radio"
          name={name}
          value={value}
          checked={filters[name] === value}
          onChange={() => updateFilter(name, value)}
        />
        {label}
      </label>
    );
  }

  return (
    <div className="catalog">
      <section className="hero" aria-labelledby="catalog-title">
        <div className="hero-copy">
          <p className="eyebrow">Online Bookstore</p>
          <h1 id="catalog-title">Find your next favourite read</h1>
          <p>Browse books from independent sellers, compare prices and see what other readers think.</p>
        </div>
        {total > 0 && (
          <div className="hero-sticker" aria-hidden="true">
            <Burst size={150} />
            <span>
              <strong>{total}</strong>
              books
            </span>
          </div>
        )}
      </section>

      <div className="catalog-layout">
        <aside className="filters" aria-labelledby="filters-title">
          <div className="filters-head">
            <h2 id="filters-title">Filters</h2>
            {activeFilters.length > 0 && (
              <button type="button" className="link-button" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-block filters-toggle"
            aria-expanded={filtersOpen}
            aria-controls="catalog-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {filtersOpen ? 'Hide filters' : 'Show filters'}
            {activeFilters.length > 0 && ` (${activeFilters.length})`}
          </button>

          <div id="catalog-filters" className={`filters-body${filtersOpen ? ' is-open' : ''}`}>
            <fieldset>
              <legend>Category</legend>
              {radio('category', '', 'All categories')}
              {categories.map((category) => radio('category', category._id, category.name))}
            </fieldset>

            <fieldset>
              <legend>Price (₹)</legend>
              <div className="price-range">
                <label>
                  Minimum
                  <input
                    type="number"
                    min="0"
                    placeholder="Min"
                    value={filters.minPrice}
                    onChange={(event) => updateFilter('minPrice', event.target.value)}
                  />
                </label>
                <label>
                  Maximum
                  <input
                    type="number"
                    min="0"
                    placeholder="Max"
                    value={filters.maxPrice}
                    onChange={(event) => updateFilter('maxPrice', event.target.value)}
                  />
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Customer rating</legend>
              {radio('minRating', '', 'Any rating')}
              {['4', '3', '2', '1'].map((stars) => radio('minRating', stars, `${stars} stars & up`))}
            </fieldset>

            <fieldset>
              <legend>Availability</legend>
              {radio('availability', '', 'All books')}
              {radio('availability', 'true', 'Available')}
              {radio('availability', 'false', 'Unavailable')}
            </fieldset>
          </div>
        </aside>

        <section className="results" aria-labelledby="results-title" aria-busy={loading}>
          <div className="results-bar">
            <h2 id="results-title" className="results-count" aria-live="polite">
              {loading ? 'Loading books...' : `${total} book${total === 1 ? '' : 's'} found`}
            </h2>

            <label className="sort-control">
              Sort by
              <select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value)}>
                <option value="title_asc">Title: A–Z</option>
                <option value="title_desc">Title: Z–A</option>
                <option value="price_asc">Price: Low to high</option>
                <option value="price_desc">Price: High to low</option>
                <option value="rating_desc">Highest rated</option>
                <option value="newest">Newest first</option>
              </select>
            </label>
          </div>

          {activeFilters.length > 0 && (
            <ul className="chips" aria-label="Active filters">
              {activeFilters.map((filter) => (
                <li key={filter.key}>
                  <button
                    type="button"
                    className="chip"
                    aria-label={`Remove filter: ${filter.label}`}
                    onClick={() => updateFilter(filter.key, '')}
                  >
                    {filter.label}
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <p role="alert" className="alert alert-error">{error}</p>}

          {!loading && !error && books.length === 0 && (
            <div className="card empty-state">
              <h3>No books found</h3>
              <p>Try changing your filters.</p>
              <button type="button" className="btn" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          )}

          <div className="book-grid">
            {loading && books.length === 0
              ? Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="book-card skeleton" aria-hidden="true" />
              ))
              : books.map((book) => <BookCard key={book._id} book={book} />)}
          </div>

          {totalPages > 1 && (
            <PageNav
              label="Catalog pagination"
              page={page}
              totalPages={totalPages}
              disabled={loading}
              onPage={setPage}
            />
          )}
        </section>
      </div>
    </div>
  );
}
