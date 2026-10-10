import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getCart,
  updateCartItem,
  removeCartItem,
} from '../api/cart.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function CartPage() {
  const { user } = useAuth();

  const [cart, setCart] = useState({
    items: [],
    itemCount: 0,
    subtotal: 0,
  });
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadCart = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const result = await getCart();
      setCart(result);

      setQuantities(
        Object.fromEntries(
          (result.items || []).map((item) => [
            item.listingId,
            String(item.quantity),
          ]),
        ),
      );
    } catch (err) {
      setError(err?.message || 'Unable to load your shopping cart.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  async function changeQuantity(item) {
    const rawQuantity = quantities[item.listingId];
    const quantity = Number(rawQuantity);
    const stock = item.listing?.stock ?? 0;

    if (
      rawQuantity === '' ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > stock
    ) {
      setError(`Enter a whole-number quantity between 1 and ${stock}.`);
      return;
    }

    if (quantity === item.quantity) {
      setError('');
      setNotice('Quantity is unchanged.');
      return;
    }

    setBusyId(item.listingId);
    setError('');
    setNotice('');

    try {
      const result = await updateCartItem(item.listingId, quantity);
      setCart(result);
      setQuantities(
        Object.fromEntries(
          (result.items || []).map((cartItem) => [
            cartItem.listingId,
            String(cartItem.quantity),
          ]),
        ),
      );
      setNotice('Cart quantity updated.');
    } catch (err) {
      setError(err?.message || 'Unable to update the quantity.');
      setQuantities((previous) => ({
        ...previous,
        [item.listingId]: String(item.quantity),
      }));
    } finally {
      setBusyId('');
    }
  }

  async function removeItem(item) {
    setBusyId(item.listingId);
    setError('');
    setNotice('');

    try {
      const result = await removeCartItem(item.listingId);
      setCart(result);
      setQuantities(
        Object.fromEntries(
          (result.items || []).map((cartItem) => [
            cartItem.listingId,
            String(cartItem.quantity),
          ]),
        ),
      );
      setNotice('Item removed from your cart.');
    } catch (err) {
      setError(err?.message || 'Unable to remove this item.');
    } finally {
      setBusyId('');
    }
  }

  if (loading) {
    return (
      <section className="stack">
        <h1>Shopping cart</h1>
        <p>Loading your cart...</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="stack">
        <h1>Shopping cart</h1>
        <article className="card stack">
          <p>Please log in to view your shopping cart.</p>
          <Link className="btn" to="/login">
            Log in
          </Link>
        </article>
      </section>
    );
  }

  return (
    <section className="stack">
      <h1>Shopping cart</h1>

      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      {cart.items.length === 0 ? (
        <article className="card stack">
          <h2>Your cart is empty</h2>
          <p>Find a book you love and add it to your cart.</p>
          <Link className="btn" to="/">
            Browse books
          </Link>
        </article>
      ) : (
        <>
          {cart.items.map((item) => {
            const listing = item.listing;
            const book = listing?.book;
            const busy = busyId === item.listingId;

            return (
              <article className="card stack" key={item.listingId}>
                <h2>{book?.title || 'Book no longer available'}</h2>

                {book?.coverImageUrl && (
                  <img
                    src={book.coverImageUrl}
                    alt={`Cover of ${book.title}`}
                    style={{
                      width: '100%',
                      maxWidth: '160px',
                      maxHeight: '220px',
                      objectFit: 'contain',
                    }}
                  />
                )}

                {book?.author && <p>Author: {book.author}</p>}

                {listing && (
                  <>
                    <p>
                      Seller: {listing.seller?.name || 'Bookstore seller'}
                    </p>
                    <p>Condition: {listing.condition}</p>
                    <p>
                      Unit price: ₹{Number(listing.price).toFixed(2)}
                    </p>
                    <p>Available stock: {listing.stock}</p>
                  </>
                )}

                {!item.available && (
                  <p role="alert">
                    This listing is unavailable. Remove it from your cart.
                  </p>
                )}

                <p>
                  Line total: ₹{Number(item.lineTotal).toFixed(2)}
                </p>

                <div className="stack">
                  <label htmlFor={`quantity-${item.listingId}`}>
                    Quantity
                  </label>

                  <input
                    id={`quantity-${item.listingId}`}
                    type="number"
                    min="1"
                    max={listing?.stock || undefined}
                    step="1"
                    value={quantities[item.listingId] ?? String(item.quantity)}
                    disabled={busy || !item.available}
                    onChange={(event) => {
                      setQuantities((previous) => ({
                        ...previous,
                        [item.listingId]: event.target.value,
                      }));
                    }}
                  />

                  <button
                    type="button"
                    disabled={busy || !item.available}
                    onClick={() => changeQuantity(item)}
                  >
                    {busy ? 'Please wait...' : 'Update quantity'}
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => removeItem(item)}
                  >
                    {busy ? 'Please wait...' : 'Remove item'}
                  </button>
                </div>
              </article>
            );
          })}

          <article className="card stack">
            <h2>Order summary</h2>
            <p>Items: {cart.itemCount}</p>
            <p>
              <strong>
                Subtotal: ₹{Number(cart.subtotal).toFixed(2)}
              </strong>
            </p>
            <p className="muted">
              Delivery charges and final order totals are not included.
            </p>
            <Link className="btn btn-secondary" to="/">
              Continue shopping
            </Link>
          </article>
        </>
      )}
    </section>
  );
}
```