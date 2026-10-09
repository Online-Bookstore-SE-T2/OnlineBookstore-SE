import { useEffect, useState } from 'react';
import { apiRequest } from '../api/http.js';

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

        const searchPath = '/books/search?' + params.toString();
        const data = await apiRequest(searchPath);

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
    setSubmittedQuery(query.trim());
  }

  function handleClear() {
    setQuery('');
    setPage(1);
    setSubmittedQuery('');
  }

  return (
    <section className="stack">
      <div>
        <h1>Search Books</h1>
        <p className="muted">
          Search by title, author, ISBN, or any keyword.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card stack">
        <label htmlFor="book-search">Search</label>

        <div className="grid-2">
          <input
            id="book-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Enter title, author, or ISBN"
            maxLength={100}
          />

          <div>
            <button type="submit">Search</button>{' '}
            <button
              type="button"
              className="link-button"
              onClick={handleClear}
            >
              Clear
            </button>
          </div>
        </div>
      </form>

      {loading && <p className="muted">Searching books...</p>}

      {error && (
        <div className="card" role="alert">
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && results && (
        <>
          <div className="stack">
            <h2>
              {results.total} {results.total === 1 ? 'book' : 'books'} found
            </h2>

            {results.items.length === 0 ? (
              <div className="card">
                <p>No books found.</p>
              </div>
            ) : (
              results.items.map((book) => (
                <article className="card" key={book._id}>
                  <h3>{book.title}</h3>

                  <p>
                    <strong>Author:</strong> {book.author}
                  </p>

                  <p>
                    <strong>ISBN:</strong> {book.isbn}
                  </p>

                  {book.category && book.category.name && (
                    <p>
                      <strong>Category:</strong> {book.category.name}
                    </p>
                  )}

                  {book.price !== undefined && book.price !== null && (
                    <p>
                      <strong>Price:</strong> ₹
                      {Number(book.price).toFixed(2)}
                    </p>
                  )}
                </article>
              ))
            )}
          </div>

          {results.totalPages > 1 && (
            <div className="card">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>{' '}

              <span>
                Page {results.page} of {results.totalPages}
              </span>{' '}

              <button
                type="button"
                disabled={page >= results.totalPages || loading}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}