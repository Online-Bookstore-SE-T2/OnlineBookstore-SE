import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiRequest, ApiError } from '../api/http.js';
import { useAuth } from '../auth/AuthContext.jsx';
import FormField from '../components/FormField.jsx';
import { Stars } from '../components/Rating.jsx';

export default function BookReviewsPage() {
  const { bookId } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [mine, setMine] = useState(null);
  const [rating, setRating] = useState('5');
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await apiRequest(`/books/${bookId}/reviews`);
    setData(result);
    if (user) {
      try {
        const mineResult = await apiRequest(`/books/${bookId}/reviews/mine`);
        setMine(mineResult.review);
        if (mineResult.review) {
          setRating(String(mineResult.review.rating));
          setText(mineResult.review.text || '');
        }
      } catch { setMine(null); }
    }
  }, [bookId, user]);

  useEffect(() => { load().catch((err) => setError(err.message)); }, [load]);

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (mine) await apiRequest(`/books/${bookId}/reviews/mine`, { method: 'PUT', body: { rating: Number(rating), text } });
      else await apiRequest(`/books/${bookId}/reviews`, { method: 'POST', body: { rating: Number(rating), text } });
      setMessage(mine ? 'Your review has been updated.' : 'Your review has been posted.');
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Your review could not be saved.'); }
    finally { setBusy(false); }
  }

  if (error && !data) return <section><h1>Reviews</h1><p role="alert">{error}</p></section>;
  if (!data) return <p role="status">Loading reviews…</p>;
  return (
    <section className="stack">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <ol><li><Link to="/">Catalog</Link></li><li><Link to={`/books/${bookId}`}>{data.book.title}</Link></li><li aria-current="page">Reviews</li></ol>
      </nav>
      <header className="reviews-hero">
        <div><h1>Reviews for {data.book.title}</h1><p>By {data.book.author}</p></div>
        <div className="reviews-score"><span className="reviews-score-value" aria-hidden="true">{data.book.averageRating.toFixed(1)}</span><Stars value={data.book.averageRating} size={22} /><p>Average rating: {data.book.averageRating.toFixed(1)} out of 5 ({data.book.reviewCount} reviews)</p></div>
      </header>
      {user && <form className="card stack review-form" onSubmit={submit}>
        <h2>{mine ? 'Edit your review' : 'Write a review'}</h2>
        <FormField id="rating" label="Rating" as="select" required value={rating} onChange={(event) => setRating(event.target.value)}>
          {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} out of 5</option>)}
        </FormField>
        <FormField id="review-text" label="Review" as="textarea" hint="Optional, up to 2,000 characters." maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} />
        {message && <p role="status" className="alert">{message}</p>}{error && <p role="alert" className="alert alert-error">{error}</p>}
        <div><button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : mine ? 'Update review' : 'Post review'}</button></div>
      </form>}
      {!user && <p className="card">Log in after delivery to write a review.</p>}
      <div className="review-list" aria-label="Customer reviews">
        {data.reviews.length === 0 ? <p className="card">No reviews yet.</p> : data.reviews.map((review) => <article className="card review" key={review.id}>
          <div className="review-head"><Stars value={review.rating} /><h2 className="review-score">{review.rating} out of 5</h2></div><p><strong>By {review.user?.name || 'Bookstore customer'}</strong></p>{review.text && <p>{review.text}</p>}
          <time className="muted" dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString()}</time>
        </article>)}
      </div>
    </section>
  );
}
