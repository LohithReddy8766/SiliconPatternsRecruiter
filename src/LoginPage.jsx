import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";
import { useAuth } from './AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const handleGoogleSuccess = (credentialResponse) => {
    setError('');
    try {
      const decoded = jwtDecode(credentialResponse.credential);
      // Ensure we extract the required fields from Google's token
      const userData = {
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture
      };
      
      login(userData);
      navigate('/');
    } catch (err) {
      setError(err.message || "Failed to authenticate with Google.");
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
            color: '#f87171', fontSize: '13px', fontWeight: '500' 
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
          {/* Real Google SSO (Requires VITE_GOOGLE_CLIENT_ID to be set) */}
          {import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError('Google login failed.')}
              useOneTap
              theme="filled_black"
              shape="rectangular"
              width="320"
            />
          ) : (
            <div style={{ 
              padding: '12px', backgroundColor: 'rgba(251, 191, 36, 0.1)', 
              border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: '8px', 
              color: '#fbbf24', fontSize: '12px', textAlign: 'left', width: '100%', boxSizing: 'border-box'
            }}>
              <strong>No Google Client ID Found</strong><br/>
              SSO is disabled because VITE_GOOGLE_CLIENT_ID is not configured in your .env file.
            </div>
          )}

          {/* Development Bypass */}
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
            Development Bypass
          </button>
          
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
            The Development Bypass lets you login immediately as <strong>dev@siliconpatterns.com</strong> to continue building without setting up OAuth keys.
          </p>
        </div>

      </div>
    </div>
  );
}
