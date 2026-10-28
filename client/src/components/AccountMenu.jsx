import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import strings from '../resources/strings.js';
import { ChevronDownIcon, UserIcon } from './Icons.jsx';

// Visitors see Log in and Register; a logged-in user gets a keyboard-operable account menu.
export default function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointerDown(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  if (!user) {
    return (
      <>
        <Link to="/login" className="nav-item">
          <UserIcon />
          <span className="nav-label">{strings.header.login}</span>
        </Link>
        <Link to="/register" className="btn btn-small btn-dark">{strings.header.register}</Link>
      </>
    );
  }

  async function onLogout() {
    setOpen(false);
    await logout();
    navigate('/');
  }

  return (
    <div className="account-menu" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        className="nav-item"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={strings.header.accountMenuLabel(user.name)}
        onClick={() => setOpen((value) => !value)}
      >
        <UserIcon />
        <span className="nav-label">{strings.header.accountMenu}</span>
        <ChevronDownIcon size={16} />
      </button>
      {open && (
        <ul id={menuId} className="account-menu-list">
          <li>
            <Link to="/profile" onClick={() => setOpen(false)}>
              {strings.account.profile}
            </Link>
          </li>
          {user.role === 'Administrator' && (
            <li>
              <Link to="/admin" onClick={() => setOpen(false)}>
                {strings.account.administration}
              </Link>
            </li>
          )}
          {user.role === 'Seller' && <li><Link to="/seller/listings" onClick={() => setOpen(false)}>Manage listings</Link></li>}
          <li>
            <button type="button" onClick={onLogout}>
              {strings.account.logout}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
