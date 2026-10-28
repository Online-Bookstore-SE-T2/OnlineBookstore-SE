
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/http.js';

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState(null);
  const [resultsQuery, setResultsQuery] = useState(null);
  const [suggestedCategories, setSuggestedCategories] = useState([]);
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

        const data = await apiRequest(
          `/books/search?${params.toString()}`
        );

        if (!cancelled) {
          setResults(data);
          setResultsQuery(submittedQuery);
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

  useEffect(() => {
    let cancelled = false;

    async function loadSuggestedCategories() {
      if (
        !submittedQuery ||
        !results ||
        resultsQuery !== submittedQuery ||
        results.items.length > 0
      ) {
        setSuggestedCategories([]);
        return;
      }

      try {
        const data = await apiRequest('/books/categories');
        if (!cancelled) {
          setSuggestedCategories(
            Array.isArray(data.items) ? data.items : []
          );
        }
      } catch {
        // Search still works if the optional category suggestions fail.
        if (!cancelled) setSuggestedCategories([]);
      }
    }

    loadSuggestedCategories();

    return () => {
      cancelled = true;
    };
  }, [submittedQuery, results, resultsQuery]);

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
              <div className="card stack">
                <p>No books found.</p>
                {submittedQuery && suggestedCategories.length > 0 && (
                  <div>
                    <p>Try browsing one of these categories:</p>
                    <ul>
                      {suggestedCategories.map((category) => (
                        <li key={category._id}>
                          <Link
                            to={`/?${new URLSearchParams({
                              category: category._id,
                            }).toString()}`}
                          >
                            {category.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              results.items.map((book) => (
                <article className="card stack" key={book._id}>
                  <h3>{book.title}</h3>

                  <p>
                    <strong>Author:</strong> {book.author}
                  </p>

                  <p>
                    <strong>ISBN:</strong> {book.isbn}
                  </p>

                  {book.category?.name && (
                    <p>
                      <strong>Category:</strong> {book.category.name}
                    </p>
                  )}

                  {typeof book.price === 'number' && (
                    <p>
                      <strong>Price:</strong> ₹
                      {Number(book.price).toFixed(2)}
                    </p>
                  )}

                  <Link to={`/books/${book._id}`}>View Details</Link>
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
