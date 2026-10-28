import { StarIcon } from './Icons.jsx';

// Decorative row of five stars filled to the nearest whole star; callers show the value as text.
export function Stars({ value = 0, size }) {
  const rounded = Math.round(value);
  return (
    <span className="rating-stars" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon key={star} size={size} filled={star <= rounded} />
      ))}
    </span>
  );
}

// Stars plus the value as text, so the rating is never conveyed by the icons alone, and screen
// readers hear a full sentence (NFR11).
export default function Rating({ value, count }) {
  const hasRating = typeof value === 'number' && (count === undefined || count > 0);
  const shown = hasRating ? Number(value.toFixed(1)) : 0;
  const reviews = typeof count === 'number' ? `, ${count} ${count === 1 ? 'review' : 'reviews'}` : '';

  return (
    <span className="rating">
      <Stars value={shown} />
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
