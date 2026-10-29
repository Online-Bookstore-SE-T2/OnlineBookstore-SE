import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '../components/Alert.jsx';
import { listNotifications, markNotificationRead } from '../api/notifications.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const refresh = useCallback(async () => {
    try {
      setNotifications(await listNotifications());
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function markRead(id) {
    setBusyId(id);
    try {
      const updated = await markNotificationRead(id);
      setNotifications((current) => current.map((item) => item.id === id ? updated : item));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  }

  function orderPath(notification) {
    if (!notification.relatedOrder?.id) return null;
    const sellerNotification = notification.type.startsWith('SELLER_') || user?.role === 'Seller';
    return sellerNotification
      ? `/seller/orders?order=${encodeURIComponent(notification.relatedOrder.id)}`
      : `/orders/${notification.relatedOrder.id}`;
  }

  return (
    <section className="stack">
      <h1>Notifications</h1>
      {error && <Alert type="error">{error}</Alert>}
      {notifications.length === 0 ? <p>You have no notifications.</p> : (
        <ul className="stack plain-list">
          {notifications.map((notification) => {
            const path = orderPath(notification);
            return (
              <li className={`card notification-card${notification.readAt ? '' : ' notification-unread'}`} key={notification.id}>
                <div className="row order-heading">
                  <h2>{notification.title}</h2>
                  {!notification.readAt && <span className="badge">Unread</span>}
                </div>
                <p>{notification.message}</p>
                <p className="muted">{new Date(notification.createdAt).toLocaleString()}</p>
                <div className="row">
                  {path && <Link to={path}>View related order</Link>}
                  {!notification.readAt && (
                    <button className="btn btn-secondary btn-small" disabled={busyId === notification.id} onClick={() => markRead(notification.id)}>
                      Mark as read
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
