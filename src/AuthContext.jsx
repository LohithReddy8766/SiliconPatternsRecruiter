import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    // Load active session
    const session = localStorage.getItem('siliconPatternsActiveSession');
    if (session) {
      setCurrentUser(JSON.parse(session));
    }

    // Check for Magic Link tokens in URL (#access_token=...)
    const fullUrl = window.location.href;
    if (fullUrl.includes('access_token=')) {
      try {
        const hashOrQuery = window.location.hash || window.location.search;
        const cleanSearch = hashOrQuery.replace('#', '?');
        const params = new URLSearchParams(cleanSearch);
        const accessToken = params.get('access_token');

        const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
        const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
        const url = localStorage.getItem('siliconPatternsSupabaseUrl') || envUrl;
        const key = localStorage.getItem('siliconPatternsSupabaseKey') || envKey;

        if (accessToken && url && key) {
          const cleanBaseUrl = url.trim().replace(/\/$/, '');
          fetch(`${cleanBaseUrl}/auth/v1/user`, {
            headers: {
              'apikey': key.trim(),
              'Authorization': `Bearer ${accessToken}`
            }
          })
          .then(res => res.json())
          .then(userData => {
            if (userData && userData.email) {
              const cleanEmail = userData.email.toLowerCase().trim();
              const username = cleanEmail.split('@')[0];
              const displayName = username.charAt(0).toUpperCase() + username.slice(1);
              
              const sessionUser = {
                email: cleanEmail,
                name: displayName,
                picture: userData.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`,
                role: cleanEmail.includes('admin') || cleanEmail === 'dev@siliconpatterns.com' ? 'admin' : 'user',
                createdAt: new Date().toISOString()
              };

              setCurrentUser(sessionUser);
              localStorage.setItem('siliconPatternsActiveSession', JSON.stringify(sessionUser));
              
              // Clear access_token hash from URL bar cleanly
              if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', window.location.pathname);
              }
            }
          })
          .catch(err => console.error("Failed to authenticate Magic Link token:", err));
        }
      } catch (err) {
        console.error("Magic link global handler error:", err);
      }
    }

    setLoading(false);
  }, []);

  const login = (userData) => {
    const { email, name, picture } = userData;
    const cleanEmail = email.toLowerCase().trim();

    // Strict Domain Restriction
    if (!cleanEmail.endsWith('@siliconpatterns.com') && cleanEmail !== 'dev@siliconpatterns.com') {
      throw new Error("Access restricted to @siliconpatterns.com corporate emails only.");
    }

    const sessionUser = {
      email: cleanEmail,
      name,
      picture,
      role: (cleanEmail.includes('admin') || cleanEmail === 'dev@siliconpatterns.com' || cleanEmail === 'ai@siliconpatterns.com') ? 'admin' : 'user',
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
