import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/http.js';
import { addToCart } from '../api/cart.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Stars } from '../components/Rating.jsx';

function sellerName(listing) {
  return typeof listing.seller === 'string'
    ? listing.seller
    : listing.seller?.name || 'Bookstore seller';
}

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
  const inStock = listings.filter((listing) => Number(listing.quantity) > 0);
  // The cheapest offer in stock is the one the main Add to Cart button buys.
  const bestOffer = [...inStock].sort((a, b) => Number(a.price) - Number(b.price))[0];
  const ratingCount = rating?.count ?? 0;
  const availability = book.markedUnavailable
    ? 'Unavailable'
    : listings.length > 0
      ? 'Available from sellers'
      : 'Currently out of stock';

  function addButton(listing, primary) {
    return (
      <button
        type="button"
        className={primary ? 'btn btn-block' : 'btn btn-secondary btn-small'}
        disabled={Number(listing.quantity) < 1 || addingListingId === listing.id}
        onClick={() => handleAddToCart(listing)}
      >
        {addingListingId === listing.id ? 'Adding...' : 'Add to Cart'}
      </button>
    );
  }

  return (
    <section className="stack">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <ol>
          <li>
            <Link to="/">Catalog</Link>
          </li>
          <li aria-current="page">{book.title}</li>
        </ol>
      </nav>

      <article className="product">
        <div className="product-cover">
          {book.coverImageUrl ? (
            <img src={book.coverImageUrl} alt={`Cover of ${book.title}`} />
          ) : (
            <span className="book-card-placeholder" aria-hidden="true">{book.title}</span>
          )}
        </div>

        <div className="product-info">
          <span className="tag">{book.category?.name || 'Uncategorised'}</span>
          <h1>{book.title}</h1>
          <p className="product-author">
            by <span>{book.author}</span>
          </p>

          <p className="product-rating">
            <Stars value={rating?.average ?? 0} size={20} />
            <span>{Number(rating?.average ?? 0).toFixed(1)} / 5</span>
            <a href="#reviews">
              ({ratingCount} {ratingCount === 1 ? 'review' : 'reviews'})
            </a>
          </p>

          <section className="product-about">
            <h2>About this book</h2>
            <p>{book.description || 'No description is available yet.'}</p>
          </section>

          <dl className="product-facts">
            <div>
              <dt>ISBN</dt>
              <dd>{book.isbn}</dd>
            </div>
            <div>
              <dt>Sellers</dt>
              <dd>{listings.length === 0 ? 'None yet' : `${listings.length} offering this book`}</dd>
            </div>
          </dl>
        </div>

        <aside className="buy-box" aria-label="Buy this book">
          {bestOffer ? (
            <>
              <p className="buy-box-label">Best price from sellers</p>
              <p className="buy-box-price">₹{Number(bestOffer.price).toFixed(2)}</p>
              {typeof book.price === 'number' && (
                <p className="muted">
                  List price <span>₹{Number(book.price).toFixed(2)}</span>
                </p>
              )}
            </>
          ) : (
            <>
              <p className="buy-box-label">List price</p>
              <p className="buy-box-price">
                {typeof book.price === 'number'
                  ? `₹${Number(book.price).toFixed(2)}`
                  : 'Not listed'}
              </p>
            </>
          )}

          <p className={`stock ${bestOffer ? 'stock-in' : 'stock-out'}`}>
            <span>{availability}</span>
          </p>

          {bestOffer && (
            <>
              <p className="buy-box-offer">
                {bestOffer.condition || 'Condition not specified'} · sold by {sellerName(bestOffer)} ·{' '}
                {bestOffer.quantity} in stock
              </p>
              {addButton(bestOffer, true)}
            </>
          )}

          {cartMessage && (
            <div className="alert" role="status">
              <p>{cartMessage}</p>
              <Link className="btn btn-secondary btn-small" to="/cart">
                View shopping cart
              </Link>
            </div>
          )}
          {cartError && <p role="alert" className="alert alert-error">{cartError}</p>}
        </aside>
      </article>

      <section className="stack" aria-labelledby="offers-title">
        <h2 id="offers-title">Available seller listings</h2>

        {listings.length === 0 ? (
          <article className="card">
            <p>
              {book.markedUnavailable
                ? 'This book is currently unavailable.'
                : 'There are no active seller listings for this book right now.'}
            </p>
          </article>
        ) : (
          <ul className="offers">
            {listings.map((listing) => (
              <li className="offer" key={listing.id}>
                <div>
                  <p className="offer-seller">{sellerName(listing)}</p>
                  <p className="muted">
                    {listing.condition || 'Not specified'} · {listing.quantity} in stock
                  </p>
                </div>
                <p className="offer-price">₹{Number(listing.price).toFixed(2)}</p>
                {addButton(listing, false)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack" id="reviews" aria-labelledby="reviews-title">
        <div className="section-head">
          <h2 id="reviews-title">Customer reviews</h2>
          <Link className="btn btn-secondary btn-small" to={`/books/${book._id || bookId}/reviews`}>
            Write a review
          </Link>
        </div>

        {!Array.isArray(reviews) || reviews.length === 0 ? (
          <article className="card">
            <p>No reviews have been submitted for this book yet.</p>
          </article>
        ) : (
          <div className="review-list">
            {reviews.map((review) => (
              <article className="card review" key={review.id}>
                <div className="review-head">
                  <h3>{review.reviewer}</h3>
                  <Stars value={review.rating} />
                  <span className="visually-hidden">{review.rating} out of 5</span>
                  <span aria-hidden="true" className="muted">({review.rating}/5)</span>
                </div>

                <p>{review.text || 'No written comment.'}</p>

                {review.createdAt && (
                  <p className="muted">
                    {new Date(review.createdAt).toLocaleDateString()}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
