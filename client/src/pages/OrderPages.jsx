import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Alert from '../components/Alert.jsx';
import { apiRequest } from '../api/http.js';
import {
  advanceSellerOrder,
  cancelOrder,
  getOrder,
  listOrders,
  listSellerOrders,
} from '../api/orders.js';

function money(value) {
  return `INR ${Number(value || 0).toFixed(2)}`;
}

function OrderItems({ items }) {
  return (
    <ul className="plain-list stack">
      {items.map((item, index) => (
        <li className="checkout-line" key={item.listing || `${item.book?.id}-${index}`}>
          <div>
            <strong>{item.title || item.book?.title || 'Book'}</strong>
            {item.book?.author && <p className="muted">by {item.book.author}</p>}
            <p>{item.quantity} × {money(item.unitPrice)}</p>
          </div>
          <strong>{money(item.quantity * item.unitPrice)}</strong>
        </li>
      ))}
    </ul>
  );
}

export function OrderHistoryPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listOrders().then(setOrders).catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="stack">
      <h1>Your orders</h1>
      {error && <Alert type="error">{error}</Alert>}
      {loading ? <p>Loading your orders...</p> : orders.length === 0 ? (
        <article className="card stack"><p>You have not placed any orders yet.</p><Link className="btn" to="/">Browse books</Link></article>
      ) : (
        <ul className="stack plain-list">
          {orders.map((order) => (
            <li className="card stack" key={order.id}>
              <div className="row order-heading">
                <h2>Order {order.id}</h2><span className="badge">{order.status}</span>
              </div>
              <p className="muted">Placed {new Date(order.createdAt).toLocaleString()}</p>
              <OrderItems items={order.items} />
              <strong>Total: {money(order.totalAmount)}</strong>
              <Link className="btn btn-secondary" to={`/orders/${order.id}`}>View order details</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function OrderDetailPage({ confirmation = false }) {
  const { orderId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const paymentIntentId = searchParams.get('payment_intent');
        let current;
        if (paymentIntentId) {
          const result = await apiRequest(`/payments/orders/${encodeURIComponent(orderId)}/confirm`, {
            method: 'POST',
            body: { transactionRef: paymentIntentId },
          });
          current = result.order;
          window.dispatchEvent(new Event('notifications-updated'));
          navigate(location.pathname, { replace: true, state: { confirmed: current.status === 'Paid' } });
        } else {
          current = await getOrder(orderId);
        }
        if (active) setOrder(current);
      } catch (requestError) {
        if (active) setError(requestError.message);
      }
    }
    load();
    return () => { active = false; };
  }, [orderId, location.pathname, navigate, searchParams]);

  async function onCancel() {
    setBusy(true);
    setError('');
    try {
      setOrder(await cancelOrder(orderId));
      setNotice('Order cancelled. Reserved stock has been released.');
      window.dispatchEvent(new Event('notifications-updated'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function checkPaymentStatus() {
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest(`/payments/orders/${encodeURIComponent(orderId)}/confirm`, {
        method: 'POST',
        body: { transactionRef: order.payment.transactionRef },
      });
      setOrder(result.order);
      setNotice(result.order.status === 'Paid' ? 'Payment confirmed.' : '');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (!order) return <section className="stack"><h1>{confirmation ? 'Order confirmation' : 'Order details'}</h1>{error ? <Alert type="error">{error}</Alert> : <p>Loading order...</p>}</section>;

  const canCancel = ['Placed', 'Paid'].includes(order.status);
  return (
    <section className="stack">
      <div className="page-head">
        <h1>{confirmation ? 'Order confirmation' : 'Order details'}</h1>
        <span className="badge">{order.status}</span>
      </div>
      {confirmation && order.status === 'Paid' && <Alert>Payment confirmed. Your order is being prepared.</Alert>}
      {notice && <Alert>{notice}</Alert>}
      {error && <Alert type="error">{error}</Alert>}
      <article className="card stack">
        <p><strong>Order number:</strong> {order.id}</p>
        <p><strong>Placed:</strong> {new Date(order.createdAt).toLocaleString()}</p>
        {order.payment?.status && (
          <p>
            <strong>Payment:</strong> {order.payment.status}
            {order.payment.failureReason && ` — ${order.payment.failureReason}`}
          </p>
        )}
        <h2>Items</h2>
        <OrderItems items={order.items} />
        <dl className="order-detail-totals">
          <div><dt>Delivery</dt><dd>{money(order.deliveryCharge)}</dd></div>
          <div><dt>Total</dt><dd>{money(order.totalAmount)}</dd></div>
        </dl>
        <h2>Delivery address</h2>
        <address>{order.deliveryAddress?.line}<br />{order.deliveryAddress?.city}, {order.deliveryAddress?.state} {order.deliveryAddress?.postalCode}</address>
        <h2>Order progress</h2>
        {order.statusHistory?.length ? (
          <ol className="status-history">
            {order.statusHistory.map((entry, index) => (
              <li key={`${entry.status}-${entry.changedAt}-${index}`}>
                <strong>{entry.status}</strong> · {new Date(entry.changedAt).toLocaleString()}
                {entry.actor?.name && <span> · {entry.actor.name}</span>}
              </li>
            ))}
          </ol>
        ) : <p className="muted">Status history is unavailable for this older order.</p>}
        {!canCancel && <p className="muted">Cancellation is no longer possible after an order has shipped, or after it is delivered or already cancelled.</p>}
        {canCancel && <button className="btn btn-secondary" type="button" disabled={busy} onClick={onCancel}>{busy ? 'Cancelling...' : 'Cancel order'}</button>}
        {order.status === 'Placed' && order.payment?.provider === 'stripe' && order.payment.status === 'Pending' && (
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={checkPaymentStatus}>
            {busy ? 'Checking...' : 'Check payment status'}
          </button>
        )}
        {order.status === 'Delivered' && (
          <div className="row">
            {order.items.map((item) => (
              <Link key={item.book?.id || item.book} to={`/books/${item.book?.id || item.book}/reviews`}>Review {item.title || item.book?.title}</Link>
            ))}
          </div>
        )}
      </article>
      <Link to="/orders">Back to order history</Link>
    </section>
  );
}

export function SellerOrdersPage() {
  const [searchParams] = useSearchParams();
  const selectedOrderId = searchParams.get('order');
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  async function refresh() {
    try {
      setOrders(await listSellerOrders());
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function advance(orderId, status) {
    setBusyId(orderId);
    setError('');
    try {
      await advanceSellerOrder(orderId, status);
      await refresh();
      window.dispatchEvent(new Event('notifications-updated'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className="stack">
      <h1>Orders for your listings</h1>
      {error && <Alert type="error">{error}</Alert>}
      {orders.length === 0 ? <p>No orders include your listings yet.</p> : (
        <ul className="stack plain-list">
          {orders.filter((order) => !selectedOrderId || order.id === selectedOrderId).map((order) => (
            <li className="card stack" key={order.id}>
              <div className="row order-heading"><h2>Order {order.id}</h2><span className="badge">{order.status}</span></div>
              <p>Buyer: {order.buyer?.name || 'Bookstore buyer'}</p>
              <OrderItems items={order.items} />
              <h3>Delivery address</h3>
              <address>{order.deliveryAddress?.line}<br />{order.deliveryAddress?.city}, {order.deliveryAddress?.state} {order.deliveryAddress?.postalCode}</address>
              {order.status === 'Paid' && (
                <button className="btn" disabled={busyId === order.id} onClick={() => advance(order.id, 'Shipped')}>Mark shipped</button>
              )}
              {order.status === 'Shipped' && (
                <button className="btn" disabled={busyId === order.id} onClick={() => advance(order.id, 'Delivered')}>Mark delivered</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {selectedOrderId && <Link to="/seller/orders">View all your orders</Link>}
    </section>
  );
}
