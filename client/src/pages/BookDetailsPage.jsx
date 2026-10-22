
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiRequest } from '../api/http.js';

export default function BookDetailsPage() {
  const { bookId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadDetails() {
      setLoading(true);
      setError('');
      setData(null);

      try {
        const result = await apiRequest(`/books/${bookId}`);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Unable to load book details.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDetails();

    return () => {
      cancelled = true;
    };
  }, [bookId]);

  if (loading) {
    return <main className="stack"><p>Loading book details...</p></main>;
  }

  if (error || !data) {
    return (
      <main className="stack">
        <h1>Book details unavailable</h1>
        <p role="alert">{error || 'This book could not be found.'}</p>
        <Link to="/">Back to catalog</Link>
      </main>
    );
  }

  const { book, rating, reviews } = data;

  return (
    <main className="stack">
      <Link to="/">← Back to catalog</Link>

      <article className="card stack">
        {book.coverImageUrl && (
          <img
            src={book.coverImageUrl}
            alt={`Cover of ${book.title}`}
            style={{
              width: '100%',
              maxWidth: '320px',
              maxHeight: '400px',
              objectFit: 'contain',
            }}
          />
        )}

        <h1>{book.title}</h1>
        <p><strong>Author:</strong> {book.author}</p>
        <p><strong>ISBN:</strong> {book.isbn}</p>
        <p><strong>Category:</strong> {book.category?.name || 'Uncategorised'}</p>

        <p>
          <strong>Price:</strong>{' '}
          {book.price != null ? `₹${Number(book.price).toFixed(2)}` : 'Not listed'}
        </p>

        <p>
          <strong>Availability:</strong>{' '}
          {book.markedUnavailable ? 'Unavailable' : 'See current listings'}
        </p>

        <section className="stack">
          <h2>About this book</h2>
          <p>{book.description || 'No description is available yet.'}</p>
        </section>

        <section className="stack">
          <h2>Customer rating</h2>
          <p>
            ⭐ {Number(rating.average).toFixed(1)} / 5
            {' '}({rating.count} {rating.count === 1 ? 'review' : 'reviews'})
          </p>
        </section>
      </article>

      <section className="stack">
        <h2>Customer reviews</h2>

        {reviews.length === 0 ? (
          <article className="card">
            <p>No reviews have been submitted for this book yet.</p>
          </article>
        ) : (
          reviews.map((review) => (
            <article className="card stack" key={review.id}>
              <h3>{review.reviewer}</h3>
              <p>{'⭐'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)} ({review.rating}/5)</p>
              <p>{review.text || 'No written comment.'}</p>
              {review.createdAt && (
                <p className="muted">
                  {new Date(review.createdAt).toLocaleDateString()}
                </p>
              )}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
