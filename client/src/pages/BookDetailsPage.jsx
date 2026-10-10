
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/http.js';
import { addToCart } from '../api/cart.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function BookDetailsPage() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cartMessage, setCartMessage] = useState('');
  const [cartError, setCartError] = useState('');
  const [addingListingId, setAddingListingId] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadDetails() {
      setLoading(true);
      setError('');
      setData(null);

      try {
        const result = await apiRequest(`/books/${bookId}`);

        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Unable to load book details.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDetails();

    return () => {
      cancelled = true;
    };
  }, [bookId]);

  async function handleAddToCart(listing) {
    setCartMessage('');
    setCartError('');

    if (!user) {
      navigate('/login');
      return;
    }

    setAddingListingId(listing.id);

    try {
      await addToCart(listing.id, 1);
      setCartMessage('Book added to your shopping cart successfully!');
    } catch (err) {
      setCartError(err?.message || 'Unable to add this book to your cart.');
    } finally {
      setAddingListingId('');
    }
  }

  if (loading) {
    return (
      <section className="stack">
        <h1>Book details</h1>
        <p>Loading book details...</p>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="stack">
        <h1>Book details unavailable</h1>
        <p role="alert">{error || 'This book could not be found.'}</p>
        <Link to="/">Back to catalog</Link>
      </section>
    );
  }

  const { book, rating, reviews } = data;
  const listings = Array.isArray(data.listings) ? data.listings : [];

  return (
    <section className="stack">
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
        <p>
          <strong>Category:</strong>{' '}
          {book.category?.name || 'Uncategorised'}
        </p>

        <p>
          <strong>Availability:</strong>{' '}
          {book.markedUnavailable
            ? 'Unavailable'
            : listings.length > 0
              ? 'Available from sellers'
              : 'Currently out of stock'}
        </p>

        <section className="stack">
          <h2>About this book</h2>
          <p>{book.description || 'No description is available yet.'}</p>
        </section>

        <section className="stack">
          <h2>Customer rating</h2>
          <p>
            ⭐ {Number(rating?.average ?? 0).toFixed(1)} / 5
            {' '}({rating?.count ?? 0}{' '}
            {(rating?.count ?? 0) === 1 ? 'review' : 'reviews'})
          </p>
        </section>
      </article>

      <section className="stack">
        <h2>Available seller listings</h2>

        {cartMessage && <p role="status">{cartMessage}</p>}
        {cartError && <p role="alert">{cartError}</p>}

        {listings.length === 0 ? (
          <article className="card">
            <p>
              {book.markedUnavailable
                ? 'This book is currently unavailable.'
                : 'There are no active seller listings for this book right now.'}
            </p>
          </article>
        ) : (
          listings.map((listing) => (
            <article className="card stack" key={listing.id}>
              <h3>{book.title}</h3>

              <p>
                <strong>Seller:</strong>{' '}
                {typeof listing.seller === 'string'
                  ? listing.seller
                  : listing.seller?.name || 'Bookstore seller'}
              </p>

              <p>
                <strong>Price:</strong>{' '}
                ₹{Number(listing.price).toFixed(2)}
              </p>

              <p>
                <strong>Condition:</strong>{' '}
                {listing.condition || 'Not specified'}
              </p>

              <p>
                <strong>Available quantity:</strong>{' '}
                {listing.quantity}
              </p>

              <button
                type="button"
                className="btn"
                disabled={
                  Number(listing.quantity) < 1 ||
                  addingListingId === listing.id
                }
                onClick={() => handleAddToCart(listing)}
              >
                {addingListingId === listing.id
                  ? 'Adding...'
                  : 'Add to Cart'}
              </button>
            </article>
          ))
        )}

        {cartMessage && (
          <Link className="btn btn-secondary" to="/cart">
            View shopping cart
          </Link>
        )}
      </section>

      <section className="stack">
        <h2>Customer reviews</h2>

        {!Array.isArray(reviews) || reviews.length === 0 ? (
          <article className="card">
            <p>No reviews have been submitted for this book yet.</p>
          </article>
        ) : (
          reviews.map((review) => (
            <article className="card stack" key={review.id}>
              <h3>{review.reviewer}</h3>

              <p>
                {'⭐'.repeat(review.rating)}
                {'☆'.repeat(Math.max(0, 5 - review.rating))}
                {' '}({review.rating}/5)
              </p>

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
    </section>
  );
}
