import { useEffect, useState } from 'react';
import { apiRequest } from '../api/http.js';
import FormField from '../components/FormField.jsx';

const blank = { isbn: '', price: '', quantity: '1', condition: 'Good', notes: '' };

export default function SellerListingsPage() {
  const [listings, setListings] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await apiRequest('/listings/mine');
    setListings(data.listings);
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
    setError(''); setMessage('');
    try { await apiRequest(`/listings/${listing.id}`, { method: 'DELETE' }); await load(); setMessage('Listing removed.'); }
    catch (err) { setError(err.message); }
  }

  return <section className="stack">
    <h1>Manage your listings</h1>
    <form className="card stack" onSubmit={submit}>
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
      {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
      <div className="row"><button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save listing' : 'Publish listing'}</button>{editing && <button type="button" onClick={reset}>Cancel edit</button>}</div>
    </form>
    <section className="stack"><h2>Your books for sale</h2>
      {listings.length === 0 ? <p>You have no listings yet.</p> : listings.map((listing) => <article key={listing.id} className="card stack">
        <h3>{listing.book.title}</h3><p>{listing.book.author} · ISBN {listing.book.isbn}</p><p>₹{listing.price.toFixed(2)} · {listing.quantity} available · {listing.condition}</p>{listing.notes && <p>{listing.notes}</p>}
        <div className="row"><button type="button" onClick={() => edit(listing)}>Edit</button><button type="button" onClick={() => remove(listing)}>Remove</button></div>
      </article>)}
    </section>
  </section>;
}
