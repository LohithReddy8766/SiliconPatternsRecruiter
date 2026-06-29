import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  
  // Form states
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('email'); // 'email' | 'otp'
  const [simulatedOtp, setSimulatedOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Database Connection Settings (for actual OTP emails)
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [isLocalMode, setIsLocalMode] = useState(true);

  // Settings inputs on login card
  const [showDbConfig, setShowDbConfig] = useState(false);
  const [inputUrl, setInputUrl] = useState('');
  const [inputKey, setInputKey] = useState('');

  useEffect(() => {
    const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    const dbModeStored = localStorage.getItem('siliconPatternsDbMode');
    
    const url = localStorage.getItem('siliconPatternsSupabaseUrl') || envUrl;
    const key = localStorage.getItem('siliconPatternsSupabaseKey') || envKey;
    
    // Connect to Supabase if credentials exist and user hasn't explicitly set mode to local without keys
    const activeUrl = (url.trim() && key.trim() && dbModeStored !== 'local') ? url.trim() : (envUrl.trim() && envKey.trim() ? envUrl.trim() : '');
    const activeKey = (url.trim() && key.trim() && dbModeStored !== 'local') ? key.trim() : (envUrl.trim() && envKey.trim() ? envKey.trim() : '');

    if (activeUrl && activeKey) {
      setSupabaseUrl(activeUrl);
      setSupabaseKey(activeKey);
      setInputUrl(activeUrl);
      setInputKey(activeKey);
      setIsLocalMode(false);

      // Check if user arrived via Magic Link email click (#access_token=...)
      const hash = window.location.hash;
      if (hash && hash.includes('access_token=')) {
        try {
          const params = new URLSearchParams(hash.replace('#', '?'));
          const accessToken = params.get('access_token');
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
                  picture: userData.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`
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
    } else {
      setIsLocalMode(true);
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
      localStorage.setItem('siliconPatternsDbMode', 'supabase');
      localStorage.setItem('siliconPatternsSupabaseUrl', inputUrl.trim());
      localStorage.setItem('siliconPatternsSupabaseKey', inputKey.trim());
      
      setSupabaseUrl(inputUrl.trim());
      setSupabaseKey(inputKey.trim());
      setIsLocalMode(false);
      setShowDbConfig(false);
      setMessage('Connected to Supabase. Secure OTP email delivery is now active!');
    } catch (err) {
      setError(`Failed to save configuration: ${err.message}`);
    }
  };

  const handleDisconnectDb = () => {
    localStorage.setItem('siliconPatternsDbMode', 'local');
    setSupabaseUrl('');
    setSupabaseKey('');
    setInputUrl('');
    setInputKey('');
    setIsLocalMode(true);
    setError('');
    setMessage('Disconnected database. Switched back to local developer sandbox mode.');
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    const cleanEmail = email.toLowerCase().trim();
    if (!cleanEmail) {
      setError('Please enter your email.');
      return;
    }

    // Domain Lock Check
    if (!cleanEmail.endsWith('@siliconpatterns.com') && cleanEmail !== 'dev@siliconpatterns.com') {
      setError('Access restricted. Only @siliconpatterns.com email addresses are authorized.');
      return;
    }

    setLoading(true);

    if (isLocalMode) {
      // Local Mode: Generate simulated OTP
      setTimeout(() => {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        setSimulatedOtp(code);
        setStep('otp');
        setLoading(false);
        setMessage('A sandbox verification code has been generated for your corporate account.');
      }, 600);
    } else {
      // Supabase Connected Mode: Call GoTrue auth OTP endpoint
      try {
        const cleanBaseUrl = supabaseUrl.replace(/\/$/, '');
        const res = await fetch(`${cleanBaseUrl}/auth/v1/otp`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: cleanEmail,
            create_user: true,
            options: {
              email_redirect_to: window.location.origin
            }
          })
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || res.statusText);
        }

        setStep('otp');
        setLoading(false);
        setMessage(`Verification OTP code sent to ${cleanEmail}`);
      } catch (err) {
        console.error('OTP request failed:', err);
        setError(`Failed to send verification code: ${err.message}`);
        setLoading(false);
      }
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedOtp = otp.trim();
    if (!trimmedOtp) {
      setError('Please enter your verification code.');
      return;
    }

    setLoading(true);

    if (isLocalMode) {
      // Local Mode: Validate simulated code
      setTimeout(() => {
        if (trimmedOtp === simulatedOtp) {
          try {
            const cleanEmail = email.toLowerCase().trim();
            const username = cleanEmail.split('@')[0];
            const displayName = username.charAt(0).toUpperCase() + username.slice(1);
            
            login({
              email: cleanEmail,
              name: displayName,
              picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`
            });
            
            setLoading(false);
            navigate('/');
          } catch (err) {
            setError(err.message);
            setLoading(false);
          }
        } else {
          setError('Invalid or expired verification code.');
          setLoading(false);
        }
      }, 400);
    } else {
      // Supabase Mode: Authenticate code through Supabase Auth REST
      try {
        const cleanBaseUrl = supabaseUrl.replace(/\/$/, '');
        const cleanEmail = email.toLowerCase().trim();

        // Try standard Supabase OTP verification types sequentially ('email', 'signup', 'magiclink')
        const typesToTry = ['email', 'signup', 'magiclink'];
        let verifyRes = null;

        for (const type of typesToTry) {
          const res = await fetch(`${cleanBaseUrl}/auth/v1/verify`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: cleanEmail,
              token: trimmedOtp,
              type: type
            })
          });

          if (res.ok) {
            verifyRes = res;
            break;
          } else {
            verifyRes = res;
          }
        }

        if (!verifyRes.ok) {
          const errText = await verifyRes.text();
          let parsedError = 'Invalid or expired OTP code.';
          try {
            const errJson = JSON.parse(errText);
            parsedError = errJson.error_description || errJson.message || parsedError;
          } catch(e) {}
          throw new Error(parsedError);
        }

        const data = await verifyRes.json();
        const username = cleanEmail.split('@')[0];
        const displayName = username.charAt(0).toUpperCase() + username.slice(1);

        login({
          email: cleanEmail,
          name: displayName,
          picture: data.user?.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`
        });

        setLoading(false);
        navigate('/');
      } catch (err) {
        console.error('OTP verification failed:', err);
        setError(err.message || 'OTP verification failed. Please try again.');
        setLoading(false);
      }
    }
  };

  const handleDevelopmentBypass = () => {
    try {
      login({
        email: 'dev@siliconpatterns.com',
        name: 'Development Admin',
        picture: 'https://ui-avatars.com/api/?name=Dev+Admin&background=random'
      });
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGoBack = () => {
    setStep('email');
    setOtp('');
    setSimulatedOtp('');
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
            <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', textAlign: 'left' }}>
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
                {loading ? 'Sending Code...' : 'Send Verification Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', textAlign: 'left' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Verification Code
                  </label>
                  <button 
                    type="button" 
                    onClick={handleGoBack}
                    style={{
                      background: 'none', border: 'none', fontSize: '11px', 
                      color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline',
                      padding: 0
                    }}
                  >
                    Change Email
                  </button>
                </div>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="123456"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} // digits only
                  style={{
                    width: '100%', padding: '10px 12px', boxSizing: 'border-box',
                    borderRadius: '8px', border: '1px solid var(--border-color)',
                    fontSize: '16px', color: 'var(--text-primary)', outline: 'none',
                    backgroundColor: 'var(--bg-main)', fontFamily: 'monospace',
                    textAlign: 'center', letterSpacing: '6px',
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
                {loading ? 'Verifying...' : 'Verify and Access Workspace'}
              </button>
            </form>
          )}

          {/* Development Bypass Section */}
          <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--border-color)', margin: '8px 0' }}></div>
          
          <button
            onClick={handleDevelopmentBypass}
            style={{
              width: '100%', padding: '12px', backgroundColor: 'var(--bg-main)', 
              color: 'var(--text-primary)', border: '1px solid var(--border-color)', 
              borderRadius: '8px', fontSize: '14px', fontWeight: '600', 
              cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--bg-main)'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
            Development Bypass
          </button>
          
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
            The Development Bypass lets you login immediately as <strong>dev@siliconpatterns.com</strong> to continue building without setting up OAuth keys.
          </p>

          {/* Local Simulated OTP Code Banner */}
          {isLocalMode && step === 'otp' && simulatedOtp && (
            <div style={{
              marginTop: '12px', padding: '12px',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '8px', fontSize: '12px',
              color: '#f59e0b', textAlign: 'left',
              lineHeight: '1.4'
            }}>
              <div style={{ fontWeight: '700', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                Developer Sandbox Mode
              </div>
              SSO is offline. Enter sandbox verification code: <strong style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-primary)', backgroundColor: 'var(--bg-main)', padding: '2px 6px', borderRadius: '4px', marginLeft: '2px' }}>{simulatedOtp}</strong>
            </div>
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
                  
                  {isLocalMode ? (
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
