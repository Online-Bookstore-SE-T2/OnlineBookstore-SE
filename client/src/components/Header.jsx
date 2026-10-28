
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import strings from '../resources/strings.js';
import AccountMenu from './AccountMenu.jsx';
import { BookIcon, CartIcon, HelpIcon, SearchIcon } from './Icons.jsx';

function isTypingTarget(element) {
  if (!element) return false;

  const tag = element.tagName;

  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    element.isContentEditable
  );
}

// Persistent header from SRS 3.1.
export default function Header({ cartCount = 0 }) {
  const navigate = useNavigate();
  const searchRef = useRef(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === '/' && !isTypingTarget(document.activeElement)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  function onSearch(event) {
    event.preventDefault();

    const term = query.trim();

    navigate(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  }

  return (
    <header className="site-header">
      <div className="promo-strip">
        <ul className="container" aria-label={strings.header.promoLabel}>
          {strings.header.promo.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="container header-inner">
        <Link
          to="/"
          className="logo"
          aria-label={strings.header.homeLabel}
        >
          <span className="logo-mark">
            <BookIcon size={18} />
          </span>
          {strings.appName}
        </Link>

        <form
          className="header-search"
          role="search"
          aria-label={strings.header.searchLandmark}
          onSubmit={onSearch}
        >
          <label htmlFor="global-search" className="visually-hidden">
            {strings.header.searchLabel}
          </label>

          <SearchIcon />

          <input
            id="global-search"
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={strings.header.searchPlaceholder}
          />

          <button type="submit">
            {strings.header.searchButton}
          </button>
        </form>

        <nav className="header-nav" aria-label="Primary">
          <Link to="/help" className="nav-item">
            <HelpIcon />
            <span className="nav-label">{strings.header.help}</span>
          </Link>

          <AccountMenu />

          <Link
            to="/cart"
            className="nav-item cart-link"
            aria-label={strings.header.cartLabel(cartCount)}
          >
            <CartIcon />
            <span className="nav-label">{strings.header.cart}</span>
            <span className="cart-count">{cartCount}</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
