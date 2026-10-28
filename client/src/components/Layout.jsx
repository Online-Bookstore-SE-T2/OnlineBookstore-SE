
import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { getCart } from '../api/cart.js';
import strings from '../resources/strings.js';
import Alert from './Alert.jsx';
import Header from './Header.jsx';
import Footer from './Footer.jsx';

export default function Layout() {
  const { user, loginCart } = useAuth();
  const userId = user?.id;
  const [cartCount, setCartCount] = useState(0);

  const refreshCartCount = useCallback(async () => {
    if (!userId) {
      setCartCount(0);
      return;
    }

    try {
      const cart = await getCart();
      setCartCount(cart.itemCount || 0);
    } catch {
      setCartCount(0);
    }
  }, [userId]);

  useEffect(() => {
    // Straight after log-in the response already carried the cart (SASD 4.2.3); a restored
    // session has none, so the count is fetched.
    if (userId && loginCart?.userId === userId) setCartCount(loginCart.itemCount || 0);
    else refreshCartCount();

    window.addEventListener('cart-updated', refreshCartCount);

    return () => {
      window.removeEventListener('cart-updated', refreshCartCount);
    };
  }, [refreshCartCount, userId, loginCart]);

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
