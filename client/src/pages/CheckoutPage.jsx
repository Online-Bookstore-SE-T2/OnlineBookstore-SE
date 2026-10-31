import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { apiRequest } from '../api/http.js';
import { removeCartItem } from '../api/cart.js';
import Alert from '../components/Alert.jsx';

function StripePaymentForm({ order, clientSecret, publishableKey, onPaid, onFailed }) {
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <StripePaymentFields order={order} onPaid={onPaid} onFailed={onFailed} />
    </Elements>
  );
}

function StripePaymentFields({ order, onPaid, onFailed }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submitPayment(event) {
    event.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setError('');
    const result = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: `${window.location.origin}/orders/${order.id}/confirmation`,
      },
    });
    const intent = result.paymentIntent;
    if (result.error) {
      try {
        await onFailed(order.id, order.payment.transactionRef);
      } catch {
        setError(`${result.error.message} Payment status could not be confirmed; check your order before retrying.`);
        setBusy(false);
        return;
      }
      setError(result.error.message || 'Payment was not completed.');
      setBusy(false);
      return;
    }
    if (intent?.id) {
      try {
        await onPaid(order.id, intent.id);
      } catch (confirmationError) {
        setError(confirmationError.message || 'Payment confirmation is still pending. Check your order shortly.');
        setBusy(false);
      }
    }
  }

  return (
    <form className="card stack" onSubmit={submitPayment}>
      <h2>Secure payment</h2>
      <PaymentElement />
      {error && <Alert type="error">{error}</Alert>}
      <button className="btn" type="submit" disabled={!stripe || busy}>
        {busy ? 'Processing payment...' : 'Pay securely'}
      </button>
      <p className="muted">Card details are entered directly with Stripe and never sent to this bookstore.</p>
    </form>
  );
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState('');
  const [summary, setSummary] = useState(null);
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [order, setOrder] = useState(null);
  const [intent, setIntent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refreshSummary = useCallback(async (selectedAddress) => {
    if (!selectedAddress) return;
    setError('');
    try {
      const result = await apiRequest('/checkout/validate', {
        method: 'POST',
        body: { addressId: selectedAddress },
      });
      setSummary(result.checkout);
    } catch (requestError) {
      setSummary(null);
      setError(requestError.message);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest('/users/me/addresses'),
      apiRequest('/payments/config'),
    ]).then(([addressResult, paymentResult]) => {
      if (!active) return;
      const savedAddresses = addressResult.addresses || [];
      setAddresses(savedAddresses);
      setPaymentConfig(paymentResult.payment);
      const selected = savedAddresses.find((address) => address.isDefault) || savedAddresses[0];
      if (selected) setAddressId(selected.id);
      else setLoading(false);
    }).catch((requestError) => {
      if (active) {
        setError(requestError.message);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (addressId) {
      setLoading(true);
      refreshSummary(addressId).finally(() => setLoading(false));
    }
  }, [addressId, refreshSummary]);

  async function onPaid(orderId, transactionRef) {
    const result = await apiRequest(`/payments/orders/${orderId}/confirm`, {
      method: 'POST',
      body: { transactionRef },
    });
    window.dispatchEvent(new Event('notifications-updated'));
    navigate(`/orders/${orderId}/confirmation`, { state: { confirmed: true } });
    return result.order;
  }

  async function onFailed(orderId, transactionRef) {
    const result = await apiRequest(`/payments/orders/${orderId}/confirm`, {
      method: 'POST',
      body: { transactionRef, failure: true },
    });
    setOrder(result.order);
    window.dispatchEvent(new Event('notifications-updated'));
    navigate(`/orders/${orderId}`, {
      state: { notice: 'Payment was not completed; the reserved stock was released.' },
    });
    return result.order;
  }

  async function placeOrder() {
    setBusy(true);
    setError('');
    try {
      const validation = await apiRequest('/checkout/validate', {
        method: 'POST',
        body: { addressId },
      });
      setSummary(validation.checkout);
      if (validation.checkout.items.some((item) => !item.available)) {
        setError('Remove unavailable items or update your cart before placing the order.');
        setBusy(false);
        return;
      }
      const created = await apiRequest('/checkout/orders', {
        method: 'POST',
        body: { addressId },
      });
      setOrder(created.order);
      window.dispatchEvent(new Event('notifications-updated'));
      if (paymentConfig.provider === 'stripe') {
        try {
          const payment = await apiRequest(`/payments/orders/${created.order.id}/intent`, { method: 'POST' });
          setIntent(payment.intent);
        } catch (paymentError) {
          await apiRequest(`/orders/${created.order.id}/cancel`, { method: 'POST' });
          throw paymentError;
        }
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function simulatePayment(outcome) {
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest(`/payments/orders/${order.id}/simulate`, {
        method: 'POST',
        body: { outcome },
      });
      window.dispatchEvent(new Event('notifications-updated'));
      if (result.order.status === 'Paid') {
        navigate(`/orders/${order.id}/confirmation`, { state: { confirmed: true } });
      } else {
        navigate(`/orders/${order.id}`, { state: { notice: 'Payment failed and the reserved stock was released.' } });
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeUnavailable(listingId) {
    try {
      await removeCartItem(listingId);
      await refreshSummary(addressId);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  if (loading) return <section className="stack"><h1>Checkout</h1><p>Loading checkout...</p></section>;

  if (order) {
    return (
      <section className="stack narrow">
        <h1>Complete your payment</h1>
        <p>Order <Link to={`/orders/${order.id}`}>{order.id}</Link> · INR {Number(order.totalAmount).toFixed(2)}</p>
        {error && <Alert type="error">{error}</Alert>}
        {paymentConfig.provider === 'stripe' && intent && order.status === 'Placed' && (
          <StripePaymentForm
            order={{ ...order, payment: { ...order.payment, transactionRef: intent.transactionRef } }}
            clientSecret={intent.clientSecret}
            publishableKey={paymentConfig.publishableKey}
            onPaid={onPaid}
            onFailed={onFailed}
          />
        )}
        {paymentConfig.provider === 'simulator' && (
          <div className="card stack">
            <p>Demo payment simulator (offline mode).</p>
            <div className="row">
              <button type="button" className="btn" disabled={busy} onClick={() => simulatePayment('success')}>Simulate successful payment</button>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => simulatePayment('failure')}>Simulate declined payment</button>
            </div>
          </div>
        )}
        <Link to={`/orders/${order.id}`}>View order details</Link>
      </section>
    );
  }

  if (addresses.length === 0) {
    return (
      <section className="stack narrow">
        <h1>Checkout</h1>
        <p>Add a saved delivery address before checking out.</p>
        <Link className="btn" to="/profile">Manage delivery addresses</Link>
      </section>
    );
  }

  return (
    <section className="stack">
      <h1>Checkout</h1>
      {error && <Alert type="error">{error}</Alert>}
      <div className="cart-layout">
        <div className="stack">
          <section className="card stack">
            <h2>Delivery address</h2>
            <label htmlFor="checkout-address">Choose a saved address</label>
            <select id="checkout-address" value={addressId} onChange={(event) => setAddressId(event.target.value)}>
              {addresses.map((address) => (
                <option key={address.id} value={address.id}>
                  {address.line}, {address.city}, {address.state} {address.postalCode}{address.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </section>
          <section className="card stack">
            <h2>Items</h2>
            {!summary ? <p>Reviewing current stock and prices...</p> : (
              <ul className="plain-list stack">
                {summary.items.map((item) => (
                  <li className="checkout-line" key={item.listingId}>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.quantity} × INR {Number(item.unitPrice || 0).toFixed(2)}</p>
                      {!item.available && <p role="alert" className="alert alert-error">{item.unavailableReason}</p>}
                    </div>
                    <div className="checkout-line-total">
                      <strong>INR {Number(item.subtotal || 0).toFixed(2)}</strong>
                      {!item.available && (
                        <button className="link-button" type="button" onClick={() => removeUnavailable(item.listingId)}>Remove from cart</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="order-summary" aria-labelledby="checkout-summary-title">
          <h2 id="checkout-summary-title">Order summary</h2>
          <dl>
            <div><dt>Subtotal</dt><dd>INR {Number(summary?.subtotal || 0).toFixed(2)}</dd></div>
            <div><dt>Delivery</dt><dd>INR {Number(summary?.deliveryCharge || 0).toFixed(2)}</dd></div>
            <div className="order-summary-total"><dt>Total</dt><dd>INR {Number(summary?.totalAmount || 0).toFixed(2)}</dd></div>
          </dl>
          <button
            className="btn btn-block"
            type="button"
            disabled={busy || !summary || summary.items.some((item) => !item.available)}
            onClick={placeOrder}
          >
            {busy ? 'Placing order...' : 'Place order and pay'}
          </button>
          <Link className="btn btn-secondary btn-block" to="/cart">Return to cart</Link>
        </aside>
      </div>
    </section>
  );
}
