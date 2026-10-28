
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api/http.js';
import BookCard from '../components/BookCard.jsx';
import { SearchIcon } from '../components/Icons.jsx';
import PageNav from '../components/PageNav.jsx';

export function SearchPage() {
  // The search term lives in the URL (?q=), so the header search box, the back button and shared
  // links all land on the same results.
  const [searchParams, setSearchParams] = useSearchParams();
  const submittedQuery = (searchParams.get('q') || '').trim();
  const [query, setQuery] = useState(submittedQuery);
  const [results, setResults] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setQuery(submittedQuery);
    setPage(1);
  }, [submittedQuery]);

  useEffect(() => {
    let cancelled = false;

    async function loadBooks() {
      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams();

        if (submittedQuery) {
          params.set('q', submittedQuery);
        }

        params.set('page', String(page));

        const data = await apiRequest(
          `/books/search?${params.toString()}`
        );

        if (!cancelled) {
          setResults(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setResults(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadBooks();

    return () => {
      cancelled = true;
    };
  }, [submittedQuery, page]);

  function handleSubmit(event) {
    event.preventDefault();
    setPage(1);
    const term = query.trim();
    setSearchParams(term ? { q: term } : {});
  }

  function handleClear() {
    setQuery('');
    setPage(1);
    setSearchParams({});
  }

  return (
    <section className="stack">
      <div className="page-head">
        <h1>Search Books</h1>
        <p className="muted">
          Search by title, author, ISBN, or any keyword.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card search-panel">
        <label htmlFor="book-search">Search</label>

        <div className="search-row">
          <div className="search-input">
            <SearchIcon />
            <input
              id="book-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Enter title, author, or ISBN"
              maxLength={100}
            />
          </div>

          <button type="submit" className="btn">Search</button>
          <button
            type="button"
            className="link-button"
            onClick={handleClear}
          >
            Clear
          </button>
        </div>
      </form>

      {loading && <p className="muted" role="status">Searching books...</p>}

      {error && (
        <div className="alert alert-error" role="alert">
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && results && (
        <>
          <div className="stack">
            <h2 className="results-count">
              {results.total} {results.total === 1 ? 'book' : 'books'} found
              {submittedQuery && <span className="muted"> for “{submittedQuery}”</span>}
            </h2>

            {results.items.length === 0 ? (
              <div className="card empty-state">
                <p>No books found.</p>
                <p className="muted">Check the spelling, or try a shorter title or the author&rsquo;s surname.</p>
              </div>
            ) : (
              <div className="book-grid book-grid-wide">
                {results.items.map((book) => (
                  <BookCard key={book._id} book={book} showIsbn />
                ))}
              </div>
            )}
          </div>

          {results.totalPages > 1 && (
            <PageNav
              label="Search results pagination"
              page={results.page}
              totalPages={results.totalPages}
              disabled={loading}
              onPage={setPage}
            />
          )}
        </>
      )}
    </section>
  );
}
