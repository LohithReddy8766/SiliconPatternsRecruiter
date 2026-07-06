import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

// Explicit admin allowlist. Admin is only ever granted to an email that has been
// VERIFIED against Supabase via a valid access token, so it cannot be forged by
// editing localStorage. Server-controlled app_metadata.role (which can only be
// set with the service_role key) takes precedence when present.
const ADMIN_EMAILS = new Set([
  'adminsiliconpatterns@siliconpatterns.com',
  'dev@siliconpatterns.com',
  'ai@siliconpatterns.com',
]);

function resolveRole(email, userData) {
  if (userData?.app_metadata?.role === 'admin') return 'admin';
  return ADMIN_EMAILS.has(email) ? 'admin' : 'user';
}

// True for the built-in admin accounts. These are pre-authorized, so they skip
// the "waiting for approval" gate and can log in with just email + password.
export const isAdminEmail = (email) => ADMIN_EMAILS.has((email || '').toLowerCase().trim());

function getSupabaseConfig() {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const url = (localStorage.getItem('siliconPatternsSupabaseUrl') || envUrl).trim().replace(/\/$/, '');
  const key = (localStorage.getItem('siliconPatternsSupabaseKey') || envKey).trim();
  return { url, key };
}

function buildSessionUser(userData, accessToken, refreshToken) {
  const cleanEmail = userData.email.toLowerCase().trim();
  const username = cleanEmail.split('@')[0];
  const displayName = username.charAt(0).toUpperCase() + username.slice(1);
  return {
    email: cleanEmail,
    name: displayName,
    picture: userData.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`,
    role: resolveRole(cleanEmail, userData),
    accessToken: accessToken || null,
    refreshToken: refreshToken || null,
    createdAt: new Date().toISOString()
  };
}

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const { url, key } = getSupabaseConfig();

    // Verify an access token against Supabase. Returns the verified user object
    // (the source of truth for identity + role) or null if the token is invalid.
    const verifyToken = async (accessToken) => {
      if (!url || !key || !accessToken) return null;
      try {
        const res = await fetch(`${url}/auth/v1/user`, {
          headers: { apikey: key, Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data && data.email ? data : null;
      } catch {
        return null;
      }
    };

    // Exchange a refresh token for a fresh access token so returning users are
    // not logged out every time their short-lived access token expires.
    const refreshSession = async (refreshToken) => {
      if (!url || !key || !refreshToken) return null;
      try {
        const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { apikey: key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken })
        });
        if (!res.ok) return null;
        return await res.json(); // { access_token, refresh_token, user, ... }
      } catch {
        return null;
      }
    };

    const persist = (sessionUser) => {
      if (cancelled) return;
      setCurrentUser(sessionUser);
      localStorage.setItem('siliconPatternsActiveSession', JSON.stringify(sessionUser));
    };

    const clear = () => {
      if (cancelled) return;
      setCurrentUser(null);
      localStorage.removeItem('siliconPatternsActiveSession');
    };

    const init = async () => {
      // 1) Handle magic-link tokens arriving in the URL (#access_token=...).
      const fullUrl = window.location.href;
      if (fullUrl.includes('access_token=')) {
        try {
          const hashOrQuery = window.location.hash || window.location.search;
          const params = new URLSearchParams(hashOrQuery.replace('#', '?'));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          const userData = await verifyToken(accessToken);
          if (userData) {
            persist(buildSessionUser(userData, accessToken, refreshToken));
            if (window.history && window.history.replaceState) {
              window.history.replaceState(null, '', window.location.pathname);
            }
            if (!cancelled) setLoading(false);
            return;
          }
        } catch (err) {
          console.error('Magic link handler error:', err);
        }
      }

      // 2) Re-validate any stored session against Supabase. A session is only
      //    trusted if its access token still verifies (or can be refreshed).
      //    This stops a hand-crafted localStorage entry from granting access or
      //    admin: identity and role now come from the verified server response,
      //    never from whatever JSON happens to sit in localStorage.
      const raw = localStorage.getItem('siliconPatternsActiveSession');
      if (raw) {
        try {
          const stored = JSON.parse(raw);
          const userData = await verifyToken(stored.accessToken);
          if (userData) {
            persist(buildSessionUser(userData, stored.accessToken, stored.refreshToken));
          } else {
            const refreshed = await refreshSession(stored.refreshToken);
            if (refreshed?.access_token && refreshed.user) {
              persist(buildSessionUser(refreshed.user, refreshed.access_token, refreshed.refresh_token));
            } else {
              clear();
            }
          }
        } catch {
          clear();
        }
      }

      if (!cancelled) setLoading(false);
    };

    init();
    return () => { cancelled = true; };
  }, []);

  // Called after a successful Supabase password/magic-link login. The caller
  // must pass the access token and the verified Supabase user object; role is
  // derived from those, never from arbitrary client input.
  const login = (payload) => {
    const { email, name, picture, accessToken, refreshToken, userData } = payload;
    const cleanEmail = (email || '').toLowerCase().trim();

    // Domain restriction (defence-in-depth; real enforcement must be RLS).
    if (!cleanEmail.endsWith('@siliconpatterns.com')) {
      throw new Error('Access restricted to @siliconpatterns.com corporate emails only.');
    }

    const sessionUser = {
      email: cleanEmail,
      name,
      picture,
      role: resolveRole(cleanEmail, userData),
      accessToken: accessToken || null,
      refreshToken: refreshToken || null,
      createdAt: new Date().toISOString()
    };

    setCurrentUser(sessionUser);
    localStorage.setItem('siliconPatternsActiveSession', JSON.stringify(sessionUser));
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('siliconPatternsActiveSession');
  };

  const value = {
    currentUser,
    login,
    logout,
    loading
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
