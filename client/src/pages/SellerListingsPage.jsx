import { useEffect, useState } from 'react';
import { apiRequest } from '../api/http.js';
import FormField from '../components/FormField.jsx';

const blank = { isbn: '', price: '', quantity: '1', condition: 'Good', notes: '' };

export default function SellerListingsPage() {
  const [listings, setListings] = useState([]);
  const [removalRequests, setRemovalRequests] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [requestingRemoval, setRequestingRemoval] = useState(null);
  const [removalReason, setRemovalReason] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [data, requestData] = await Promise.all([
      apiRequest('/listings/mine'),
      apiRequest('/listings/removal-requests'),
    ]);
    setListings(data.listings);
    setRemovalRequests(requestData.requests || []);
  }
  useEffect(() => { load().catch((err) => setError(err.message)); }, []);

  function change(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }
  function edit(listing) {
    setEditing(listing.id);
    setForm({ isbn: listing.book.isbn, price: String(listing.price), quantity: String(listing.quantity), condition: listing.condition, notes: listing.notes || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function reset() { setEditing(null); setForm(blank); }

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const body = { price: Number(form.price), quantity: Number(form.quantity), condition: form.condition, notes: form.notes };
    try {
      if (editing) await apiRequest(`/listings/${editing}`, { method: 'PATCH', body });
      else await apiRequest('/listings', { method: 'POST', body: { ...body, isbn: form.isbn.trim() } });
      reset(); await load(); setMessage(editing ? 'Listing updated.' : 'Book listed for sale.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function remove(listing) {
    if (!window.confirm(`Remove your listing for “${listing.book.title}”?`)) return;
    setError(''); setMessage(''); setRequestingRemoval(null);
    try { await apiRequest(`/listings/${listing.id}`, { method: 'DELETE' }); await load(); setMessage('Listing removed.'); }
    catch (err) {
      if (err.status === 409 && /open order/i.test(err.message)) {
        setRequestingRemoval(listing.id);
        setError('An open order prevents this listing from being removed. You can ask an administrator to review it.');
      } else {
        setError(err.message);
      }
    }
  }

  async function submitRemovalRequest(event, listing) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      await apiRequest(`/listings/${listing.id}/removal-requests`, {
        method: 'POST',
        body: { reason: removalReason },
      });
      setRequestingRemoval(null);
      setRemovalReason('');
      await load();
      setMessage('Your removal request has been sent to an administrator.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="stack">
    <div className="page-head">
      <h1>Manage your listings</h1>
      <p className="muted">List a catalog book for sale, or change the price and stock of one you already sell.</p>
    </div>
    <div className="seller-layout">
    <form className={`card stack seller-form${editing ? ' is-editing' : ''}`} onSubmit={submit}>
      <h2>{editing ? 'Edit listing' : 'Sell a book'}</h2>
      {!editing && <FormField id="isbn" label="Catalog ISBN-13" required value={form.isbn} onChange={change} />}
      <div className="grid-2">
        <FormField id="price" label="Price (INR)" required type="number" min="0.01" step="0.01" value={form.price} onChange={change} />
        <FormField id="quantity" label="Quantity" required type="number" min="0" step="1" value={form.quantity} onChange={change} />
      </div>
      <FormField id="condition" label="Condition" as="select" required value={form.condition} onChange={change}>
        {['New', 'Like New', 'Good', 'Acceptable'].map((condition) => <option key={condition}>{condition}</option>)}
      </FormField>
      <FormField id="notes" label="Notes" as="textarea" hint="Optional, up to 500 characters." maxLength={500} value={form.notes} onChange={change} />
      {message && <p role="status" className="alert">{message}</p>}{error && <p role="alert" className="alert alert-error">{error}</p>}
      <div className="row"><button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save listing' : 'Publish listing'}</button>{editing && <button type="button" className="btn btn-secondary" onClick={reset}>Cancel edit</button>}</div>
    </form>
    <section className="stack"><h2>Your books for sale <span className="count-pill">{listings.length}</span></h2>
      {listings.length === 0 ? <p className="card">You have no listings yet.</p> : <div className="listing-grid">{listings.map((listing) => <article key={listing.id} className="card listing-card">
        <div><span className="tag">{listing.condition}</span><h3>{listing.book.title}</h3><p className="muted">{listing.book.author} · ISBN {listing.book.isbn}</p></div>
        <p className="listing-price">₹{listing.price.toFixed(2)}<span className={`stock ${listing.quantity > 0 ? 'stock-in' : 'stock-out'}`}><span>{listing.quantity} available</span></span></p>{listing.notes && <p className="listing-notes">{listing.notes}</p>}
        <div className="row"><button type="button" className="btn btn-secondary btn-small" onClick={() => edit(listing)}>Edit</button><button type="button" className="link-button" onClick={() => remove(listing)}>Remove</button></div>
        {requestingRemoval === listing.id && <form className="stack" onSubmit={(event) => submitRemovalRequest(event, listing)}>
          <h4>Request administrator review</h4>
          <p className="muted">If approved, the listing is hidden from the catalog. Existing orders remain available to fulfil or cancel.</p>
          <FormField id={`removal-reason-${listing.id}`} label="Why should this listing be removed?" as="textarea" required maxLength={1000} value={removalReason} onChange={(event) => setRemovalReason(event.target.value)} />
          <div className="row">
            <button type="submit" className="btn btn-small" disabled={busy}>{busy ? 'Sending…' : 'Send removal request'}</button>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => { setRequestingRemoval(null); setRemovalReason(''); }}>Cancel request</button>
          </div>
        </form>}
      </article>)}</div>}
    </section>
    </div>
    <section className="stack">
      <h2>Your listing removal requests</h2>
      {removalRequests.length === 0 ? <p className="card">You have no listing removal requests.</p> : (
        <ul className="stack plain-list">
          {removalRequests.map((request) => (
            <li className="card stack" key={request.id}>
              <div className="row"><h3>{request.listing?.book?.title || 'Listing'} removal</h3><span className="badge">{request.status}</span></div>
              <p><strong>Reason:</strong> {request.reason}</p>
              {request.resolutionNote && <p><strong>Administrator’s note:</strong> {request.resolutionNote}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  </section>;
}
