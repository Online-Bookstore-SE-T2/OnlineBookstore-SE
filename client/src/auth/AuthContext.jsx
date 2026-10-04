import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest, clearToken, getToken, onUnauthorized, setToken } from '../api/http.js';

const AuthContext = createContext(null);

// Holds the logged-in user. A stored token is checked with the server on load (REQ-2).
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(() => !getToken());

  useEffect(() => {
    onUnauthorized(() => {
      clearToken();
      setUser(null);
    });
    if (!getToken()) return undefined;

    let cancelled = false;
    apiRequest('/auth/session')
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        // A rejected token is cleared by the unauthorized handler; other failures leave the visitor logged out.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await apiRequest('/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  // Log-out invalidates the token on the server, then always clears it locally.
  const logout = useCallback(async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // The local session is cleared regardless.
    } finally {
      clearToken();
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, ready, login, logout, setUser }), [user, ready, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
