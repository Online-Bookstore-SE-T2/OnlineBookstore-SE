import { StarIcon } from './Icons.jsx';

// Five stars filled to the nearest whole star. The value is always shown as text too, so the
// rating is never conveyed by the icons alone, and screen readers hear a full sentence (NFR11).
export default function Rating({ value, count }) {
  const hasRating = typeof value === 'number' && (count === undefined || count > 0);
  const rounded = hasRating ? Math.round(value) : 0;
  const shown = hasRating ? Number(value.toFixed(1)) : 0;
  const reviews = typeof count === 'number' ? `, ${count} ${count === 1 ? 'review' : 'reviews'}` : '';

  return (
    <span className="rating">
      <span className="rating-stars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => (
          <StarIcon key={star} filled={star <= rounded} />
        ))}
      </span>
      {hasRating ? (
        <>
          <span className="rating-text" aria-hidden="true">
            {shown}
            {typeof count === 'number' && <span className="muted"> ({count})</span>}
          </span>
          <span className="visually-hidden">{`Rated ${shown} out of 5${reviews}`}</span>
        </>
      ) : (
        <span className="rating-text muted">No ratings yet</span>
      )}
    </span>
  );
}
