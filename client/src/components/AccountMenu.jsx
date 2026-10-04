import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import strings from '../resources/strings.js';

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
        <Link to="/login">{strings.header.login}</Link>
        <Link to="/register">{strings.header.register}</Link>
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
        className="link-button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={strings.header.accountMenuLabel(user.name)}
        onClick={() => setOpen((value) => !value)}
      >
        {strings.header.accountMenu}
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
