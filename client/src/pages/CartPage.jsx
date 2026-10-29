import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getCart,
  updateCartItem,
  removeCartItem,
} from '../api/cart.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Burst, CartIcon } from '../components/Icons.jsx';

function quantitiesFrom(items = []) {
  return Object.fromEntries(
    items.map((item) => [item.listing, String(item.quantity)]),
  );
}

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
      setQuantities(quantitiesFrom(result.items));
    } catch (err) {
      setError(err?.message || 'Unable to load your shopping cart.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  // The stepper buttons pass the new value directly; a typed value is read from the field.
  async function changeQuantity(item, rawQuantity = quantities[item.listing]) {
    const quantity = Number(rawQuantity);
    const stock = item.listingDetails?.stock ?? 0;

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
      return;
    }

    setBusyId(item.listing);
    setError('');
    setNotice('');
    setQuantities((previous) => ({ ...previous, [item.listing]: String(quantity) }));

    try {
      const result = await updateCartItem(item.listing, quantity);
      setCart(result);
      setQuantities(quantitiesFrom(result.items));
      setNotice('Cart quantity updated.');
    } catch (err) {
      setError(err?.message || 'Unable to update the quantity.');
      setQuantities((previous) => ({
        ...previous,
        [item.listing]: String(item.quantity),
      }));
    } finally {
      setBusyId('');
    }
  }

  async function removeItem(item) {
    setBusyId(item.listing);
    setError('');
    setNotice('');

    try {
      const result = await removeCartItem(item.listing);
      setCart(result);
      setQuantities(quantitiesFrom(result.items));
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
      <div className="page-head">
        <h1>Shopping cart</h1>
        {cart.items.length > 0 && (
          <p className="muted">
            {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'} from{' '}
            {cart.items.length} {cart.items.length === 1 ? 'listing' : 'listings'}
          </p>
        )}
      </div>

      {error && <p role="alert" className="alert alert-error">{error}</p>}
      {notice && <p role="status" className="alert">{notice}</p>}

      {cart.items.length === 0 ? (
        <article className="card empty-state cart-empty">
          <span className="cart-empty-icon" aria-hidden="true">
            <Burst size={96} />
            <CartIcon size={32} />
          </span>
          <h2>Your cart is empty</h2>
          <p>Find a book you love and add it to your cart.</p>
          <Link className="btn" to="/">
            Browse books
          </Link>
        </article>
      ) : (
        <div className="cart-layout">
          <ul className="cart-items" aria-label="Items in your cart">
            {cart.items.map((item) => {
              const listing = item.listingDetails;
              const book = listing?.book;
              const busy = busyId === item.listing;
              const value = quantities[item.listing] ?? String(item.quantity);
              const stock = listing?.stock ?? 0;
              const locked = busy || !item.available;

              return (
                <li className="cart-item" key={item.listing}>
                  <div className="cart-item-cover">
                    {book?.coverImageUrl && <img src={book.coverImageUrl} alt="" />}
                  </div>

                  <div className="cart-item-info">
                    <h2>
                      {book?._id ? (
                        <Link to={`/books/${book._id}`}>{book.title}</Link>
                      ) : (
                        book?.title || 'Book no longer available'
                      )}
                    </h2>
                    {book?.author && <p className="muted">by {book.author}</p>}
                    {listing && (
                      <p className="cart-item-meta">
                        <span className="tag">{listing.condition}</span>
                        Sold by {listing.seller?.name || 'Bookstore seller'} · ₹
                        {Number(listing.price).toFixed(2)} each · {listing.stock} in stock
                      </p>
                    )}

                    {!item.available && (
                      <p role="alert" className="alert alert-error">
                        This listing is unavailable. Remove it from your cart.
                      </p>
                    )}

                    <div className="cart-item-actions">
                      <div className="stepper">
                        <button
                          type="button"
                          className="stepper-button"
                          aria-label={`Decrease quantity of ${book?.title || 'this item'}`}
                          disabled={locked || item.quantity <= 1}
                          onClick={() => changeQuantity(item, String(item.quantity - 1))}
                        >
                          −
                        </button>
                        <label htmlFor={`quantity-${item.listing}`} className="visually-hidden">
                          Quantity
                        </label>
                        <input
                          id={`quantity-${item.listing}`}
                          type="number"
                          min="1"
                          max={stock || undefined}
                          step="1"
                          value={value}
                          disabled={locked}
                          onChange={(event) => {
                            setQuantities((previous) => ({
                              ...previous,
                              [item.listing]: event.target.value,
                            }));
                          }}
                          onBlur={() => changeQuantity(item)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') changeQuantity(item);
                          }}
                        />
                        <button
                          type="button"
                          className="stepper-button"
                          aria-label={`Increase quantity of ${book?.title || 'this item'}`}
                          disabled={locked || item.quantity >= stock}
                          onClick={() => changeQuantity(item, String(item.quantity + 1))}
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        className="link-button"
                        disabled={busy}
                        onClick={() => removeItem(item)}
                      >
                        {busy ? 'Please wait...' : 'Remove item'}
                      </button>
                    </div>
                  </div>

                  <p className="cart-item-total">
                    <span className="visually-hidden">Line total: </span>
                    ₹{Number(item.lineTotal).toFixed(2)}
                  </p>
                </li>
              );
            })}
          </ul>

          <aside className="order-summary" aria-labelledby="summary-title">
            <h2 id="summary-title">Order summary</h2>
            <dl>
              <div>
                <dt>Items</dt>
                <dd>{cart.itemCount}</dd>
              </div>
              <div className="order-summary-total">
                <dt>Subtotal</dt>
                <dd>₹{Number(cart.subtotal).toFixed(2)}</dd>
              </div>
            </dl>
            <p className="muted">
              Delivery charges and final order totals are not included.
            </p>
            <Link className="btn btn-block" to="/checkout">
              Continue to checkout
            </Link>
            <Link className="btn btn-secondary btn-block" to="/">
              Continue shopping
            </Link>
          </aside>
        </div>
      )}
    </section>
  );
}
