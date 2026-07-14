import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled error caught by ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', padding: '40px', textAlign: 'center', fontFamily: 'sans-serif',
          backgroundColor: '#09090b', color: '#f4f4f5'
        }}>
          <h1 style={{ fontSize: '20px', marginBottom: '8px' }}>Something went wrong</h1>
          <p style={{ fontSize: '14px', color: '#a1a1aa', marginBottom: '20px', maxWidth: '420px' }}>
            This page hit an unexpected error. Your data is safe — reloading usually fixes this.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px', borderRadius: '6px', border: 'none',
              backgroundColor: '#f4f4f5', color: '#18181b', fontWeight: 600,
              fontSize: '13px', cursor: 'pointer'
            }}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
