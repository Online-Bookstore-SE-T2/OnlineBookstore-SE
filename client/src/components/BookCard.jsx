import { Link } from 'react-router-dom';
import { formatINR } from '../utils/format.js';
import Rating from './Rating.jsx';

const TINTS = ['yellow', 'lilac', 'mint', 'pink', 'blue', 'orange'];

// The same category always gets the same cover backdrop, so shelves of one genre look alike.
function tintFor(name = '') {
  const sum = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  return TINTS[sum % TINTS.length];
}

// Product tile for the catalog and search results. The title link is stretched over the whole
// card, so the entire tile is one large target that opens the book.
export default function BookCard({ book, showIsbn = false }) {
  const category = book.category?.name;

  return (
    <article className="book-card">
      <div className={`book-card-cover tint-${tintFor(category)}`}>
        {book.coverImageUrl ? (
          <img src={book.coverImageUrl} alt="" loading="lazy" />
        ) : (
          <span className="book-card-placeholder" aria-hidden="true">{book.title}</span>
        )}
        {book.markedUnavailable && <span className="badge badge-strong book-card-flag">Unavailable</span>}
      </div>

      <div className="book-card-body">
        {category && <span className="tag">{category}</span>}
        <h3 className="book-card-title">
          <Link to={`/books/${book._id}`}>{book.title}</Link>
        </h3>
        <p className="book-card-author">{book.author || 'Unknown'}</p>
        {showIsbn && book.isbn && (
          <p className="book-card-isbn muted">
            ISBN <span>{book.isbn}</span>
          </p>
        )}
        {typeof book.averageRating === 'number' && (
          <Rating value={book.averageRating} count={book.reviewCount} />
        )}
        <p className="book-card-price">
          {typeof book.price === 'number' ? formatINR(Number(book.price)) : 'Price not listed'}
        </p>
      </div>
    </article>
  );
}
