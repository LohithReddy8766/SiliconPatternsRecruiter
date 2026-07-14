import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, isAdminEmail } from './AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  
  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState('email'); // 'email' | 'otp'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Database Connection Settings (for actual OTP emails)
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');

  // Settings inputs on login card
  const [showDbConfig, setShowDbConfig] = useState(false);
  const [inputUrl, setInputUrl] = useState('');
  const [inputKey, setInputKey] = useState('');

  useEffect(() => {
    const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    
    const url = localStorage.getItem('siliconPatternsSupabaseUrl') || envUrl;
    const key = localStorage.getItem('siliconPatternsSupabaseKey') || envKey;
    
    const activeUrl = url.trim();
    const activeKey = key.trim();

    if (activeUrl && activeKey) {
      setSupabaseUrl(activeUrl);
      setSupabaseKey(activeKey);
      setInputUrl(activeUrl);
      setInputKey(activeKey);

      // Check if user arrived via Magic Link email click (#access_token=...)
      const hash = window.location.hash;
      if (hash && hash.includes('access_token=')) {
        try {
          const params = new URLSearchParams(hash.replace('#', '?'));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          if (accessToken) {
            const cleanBaseUrl = activeUrl.replace(/\/$/, '');
            fetch(`${cleanBaseUrl}/auth/v1/user`, {
              headers: {
                'apikey': activeKey,
                'Authorization': `Bearer ${accessToken}`
              }
            })
            .then(res => res.json())
            .then(userData => {
              if (userData && userData.email) {
                const cleanEmail = userData.email.toLowerCase().trim();
                const username = cleanEmail.split('@')[0];
                const displayName = username.charAt(0).toUpperCase() + username.slice(1);
                login({
                  email: cleanEmail,
                  name: displayName,
                  picture: userData.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`,
                  accessToken,
                  refreshToken,
                  userData
                });
                navigate('/');
              }
            })
            .catch(err => console.error("Magic link authentication error:", err));
          }
        } catch (e) {
          console.error("URL hash parsing error:", e);
        }
      }
    }
  }, []);

  const handleConnectDb = (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!inputUrl.trim() || !inputKey.trim()) {
      setError('Please provide a valid Supabase URL and API Key.');
      return;
    }

    try {
      localStorage.setItem('siliconPatternsSupabaseUrl', inputUrl.trim());
      localStorage.setItem('siliconPatternsSupabaseKey', inputKey.trim());
      
      setSupabaseUrl(inputUrl.trim());
      setSupabaseKey(inputKey.trim());
      setShowDbConfig(false);
      setMessage('Connected to Supabase. Secure OTP email delivery is now active!');
    } catch (err) {
      setError(`Failed to save configuration: ${err.message}`);
    }
  };

  const handleDisconnectDb = () => {
    localStorage.removeItem('siliconPatternsSupabaseUrl');
    localStorage.removeItem('siliconPatternsSupabaseKey');
    setSupabaseUrl('');
    setSupabaseKey('');
    setInputUrl('');
    setInputKey('');
    setError('');
    setMessage('Disconnected database.');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    const cleanEmail = email.toLowerCase().trim();
    if (!cleanEmail) {
      setError('Please enter your email.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    // Domain Lock Check
    if (!cleanEmail.endsWith('@siliconpatterns.com') && cleanEmail !== 'adminsiliconpatterns@siliconpatterns.com') {
      setError('Access restricted. Only @siliconpatterns.com email addresses are authorized.');
      return;
    }

    setLoading(true);

    if (!supabaseUrl || !supabaseKey) {
      setError('Database connection not configured. Please configure your workspace database connection below.');
      setLoading(false);
      return;
    }

    try {
      const cleanBaseUrl = supabaseUrl.replace(/\/$/, '');

      // Unconditionally attempt to create the account first.
      // If the user already exists, this will fail silently (which is expected).
      // If they are a new user, this will create their account with the provided password.
      await fetch(`${cleanBaseUrl}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: cleanEmail,
          password: password
        })
      });

      // Authenticate now (rather than after the approval check) so we hold a
      // real user access token. RLS on approved_emails/pending_users only
      // lets a user read/write their OWN row, which requires a genuine
      // Supabase session — the shared anon key alone no longer qualifies.
      let loginRes = await fetch(`${cleanBaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: cleanEmail,
          password: password
        })
      });

      let authData = null;

      if (!loginRes.ok) {
        const errText = await loginRes.text();
        let parsedError = 'Login failed.';
        try {
          const j = JSON.parse(errText);
          parsedError = j.error_description || j.msg || j.message || parsedError;
        } catch(e) {}
        throw new Error(parsedError);
      } else {
        authData = await loginRes.json();
      }

      const accessToken = authData?.access_token;

      const { checkEmailApproved, addPendingUser } = await import('./supabase.js');
      // Built-in admins are pre-authorized and skip the approval gate.
      const isApproved = isAdminEmail(cleanEmail) || await checkEmailApproved(supabaseUrl, supabaseKey, cleanEmail, accessToken);

      if (!isApproved) {
        // Add to pending_users table since they aren't on the allowlist
        await addPendingUser(supabaseUrl, supabaseKey, cleanEmail, accessToken);

        setError('Account created. Waiting for administrator approval.');
        setLoading(false);
        return;
      }

      const username = cleanEmail.split('@')[0];
      const displayName = username.charAt(0).toUpperCase() + username.slice(1);
      const avatarUrl = authData?.user?.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;

      login({
        email: cleanEmail,
        name: displayName,
        picture: avatarUrl,
        accessToken: authData?.access_token,
        refreshToken: authData?.refresh_token,
        userData: authData?.user
      });

      setLoading(false);
      navigate('/');
    } catch (err) {
      console.error('Failed to log in:', err);
      setError(err.message || 'Authentication failed. Please try again.');
      setLoading(false);
    }
  };

  // Removed handleVerifyOtp as it's no longer needed

  const handleGoBack = () => {
    setStep('email');
    setPassword('');
    setError('');
    setMessage('');
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', 
      minHeight: '100vh', backgroundColor: 'var(--bg-main)', fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{
        width: '100%', maxWidth: '400px', padding: '40px',
        backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)',
        borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '24px'
      }}>
        
        {/* Logo / Header */}
        <div>
          <div style={{ 
            width: '64px', height: '64px', margin: '0 auto 16px',
            backgroundColor: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(192, 132, 252, 0.3)',
            borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#c084fc'
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
            Silicon Patterns
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
            Corporate Portal Login
          </p>
        </div>

        {error && (
          <div style={{ 
            padding: '12px', backgroundColor: 'rgba(220, 38, 38, 0.1)', 
            border: '1px solid rgba(248, 113, 113, 0.3)', borderRadius: '8px', 
            color: '#f87171', fontSize: '13px', fontWeight: '500', textAlign: 'left', lineHeight: '1.4'
          }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ 
            padding: '12px', backgroundColor: 'rgba(16, 185, 129, 0.1)', 
            border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', 
            color: '#34d399', fontSize: '13px', fontWeight: '500', textAlign: 'left', lineHeight: '1.4'
          }}>
            {message}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
          {step === 'email' ? (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', textAlign: 'left' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Corporate Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@siliconpatterns.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', boxSizing: 'border-box',
                    borderRadius: '8px', border: '1px solid var(--border-color)',
                    fontSize: '14px', color: 'var(--text-primary)', outline: 'none',
                    backgroundColor: 'var(--bg-main)', fontFamily: 'inherit',
                    transition: 'border-color 0.15s'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', boxSizing: 'border-box',
                    borderRadius: '8px', border: '1px solid var(--border-color)',
                    fontSize: '14px', color: 'var(--text-primary)', outline: 'none',
                    backgroundColor: 'var(--bg-main)', fontFamily: 'inherit',
                    transition: 'border-color 0.15s'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '12px 16px', backgroundColor: 'var(--accent)',
                  color: 'var(--accent-fg)', border: 'none', borderRadius: '8px',
                  fontSize: '13px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.15s', opacity: loading ? 0.7 : 1, textAlign: 'center'
                }}
              >
                {loading ? 'Authenticating...' : 'Login securely'}
              </button>
            </form>
          ) : (
             <div></div>
          )}

          {/* Collapsible Connection Config Section */}
          {step === 'email' && (
            <div style={{ marginTop: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <button 
                type="button"
                onClick={() => setShowDbConfig(v => !v)}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-secondary)',
                  fontSize: '11px', textDecoration: 'underline', cursor: 'pointer',
                  outline: 'none', transition: 'color 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                {showDbConfig ? 'Hide Connection Config' : 'Configure Workspace Database Connection'}
              </button>

              {showDbConfig && (
                <div style={{ 
                  marginTop: '16px', padding: '16px', backgroundColor: 'var(--bg-main)', 
                  border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'left' 
                }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>
                    Supabase Credentials
                  </h4>
                  
                  {(!supabaseUrl || !supabaseKey) ? (
                    <form onSubmit={handleConnectDb} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase' }}>
                          Supabase URL
                        </label>
                        <input
                          type="url"
                          required
                          placeholder="https://your-project.supabase.co"
                          value={inputUrl}
                          onChange={e => setInputUrl(e.target.value)}
                          style={{
                            width: '100%', padding: '6px 8px', boxSizing: 'border-box',
                            borderRadius: '4px', border: '1px solid var(--border-color)',
                            fontSize: '12px', color: 'var(--text-primary)', backgroundColor: 'var(--bg-surface)',
                            outline: 'none'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase' }}>
                          Supabase Anon API Key
                        </label>
                        <input
                          type="password"
                          required
                          placeholder="eyJhbGciOi..."
                          value={inputKey}
                          onChange={e => setInputKey(e.target.value)}
                          style={{
                            width: '100%', padding: '6px 8px', boxSizing: 'border-box',
                            borderRadius: '4px', border: '1px solid var(--border-color)',
                            fontSize: '12px', color: 'var(--text-primary)', backgroundColor: 'var(--bg-surface)',
                            outline: 'none'
                          }}
                        />
                      </div>
                      <button
                        type="submit"
                        style={{
                          padding: '6px 12px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
                          border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                          cursor: 'pointer', marginTop: '4px', textAlign: 'center'
                        }}
                      >
                        Connect Database
                      </button>
                    </form>
                  ) : (
                    <div>
                      <p style={{ margin: '0 0 12px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                        Currently connected to: <strong style={{ color: 'var(--text-primary)' }}>{supabaseUrl.substring(0, 30)}...</strong>
                      </p>
                      <button
                        type="button"
                        onClick={handleDisconnectDb}
                        style={{
                          padding: '6px 12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#f87171',
                          border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '4px', fontSize: '11px',
                          fontWeight: '600', cursor: 'pointer'
                        }}
                      >
                        Disconnect Database
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
