import { Navigate, useLocation } from 'react-router-dom';
import strings from '../resources/strings.js';
import { useAuth } from './AuthContext.jsx';

// Guards a route: visitors are sent to the login page and brought back afterwards;
// users without one of the required roles see an access message and no data.
export default function RequireAuth({ roles, children }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <p role="status">{strings.common.loading}</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) {
    return (
      <section className="stack">
        <h1>{strings.common.noAccessTitle}</h1>
        <p>{strings.common.noAccessBody}</p>
      </section>
    );
  }
  return children;
}
