
import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { getCart } from '../api/cart.js';
import strings from '../resources/strings.js';
import Alert from './Alert.jsx';
import Header from './Header.jsx';
import Footer from './Footer.jsx';

export default function Layout() {
  const { user } = useAuth();
  const [cartCount, setCartCount] = useState(0);

  const refreshCartCount = useCallback(async () => {
    if (!user) {
      setCartCount(0);
      return;
    }

    try {
      const cart = await getCart();
      setCartCount(cart.itemCount || 0);
    } catch {
      setCartCount(0);
    }
  }, [user]);

  useEffect(() => {
    refreshCartCount();

    window.addEventListener('cart-updated', refreshCartCount);

    return () => {
      window.removeEventListener('cart-updated', refreshCartCount);
    };
  }, [refreshCartCount]);

  return (
    <div className="app">
      <a href="#main" className="skip-link">
        {strings.skipToContent}
      </a>

      <Header cartCount={cartCount} />

      <main id="main" className="main" tabIndex={-1}>
        <div className="container stack">
          {user?.status === 'Suspended' && (
            <Alert>{strings.account.suspendedBanner}</Alert>
          )}

          <Outlet />
        </div>
      </main>

      <Footer />
    </div>
  );
}
```