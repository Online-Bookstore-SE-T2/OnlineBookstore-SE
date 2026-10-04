import { Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import strings from '../resources/strings.js';
import Alert from './Alert.jsx';
import Header from './Header.jsx';
import Footer from './Footer.jsx';

export default function Layout() {
  const { user } = useAuth();
  return (
    <div className="app">
      <a href="#main" className="skip-link">
        {strings.skipToContent}
      </a>
      <Header />
      <main id="main" className="main" tabIndex={-1}>
        <div className="container stack">
          {user?.status === 'Suspended' && <Alert>{strings.account.suspendedBanner}</Alert>}
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  );
}
