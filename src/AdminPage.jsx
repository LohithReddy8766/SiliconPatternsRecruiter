import React from 'react';
import { useAuth } from './AuthContext';

export default function AdminPage() {
  const { currentUser, registeredUsers, deleteUser } = useAuth();

  // Basic guard (should also be guarded by App.jsx router ideally)
  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-primary)' }}>
        <h2>Unauthorized Access</h2>
        <p>You do not have administrator privileges to view this page.</p>
      </div>
    );
  }

  const handleDelete = (email) => {
    if (email === currentUser.email) {
      alert("You cannot delete your own active session.");
      return;
    }
    if (window.confirm(`Are you sure you want to delete the account for ${email}? They will no longer be able to log in.`)) {
      deleteUser(email);
    }
  };

  return (
    <div style={{ padding: '28px 20px', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      <div>
        <h1 style={{ margin: '0 0 8px', fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Admin Dashboard
        </h1>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
          Monitor and manage registered corporate portal accounts. Restricted to @siliconpatterns.com administrators.
        </p>
      </div>

      <div style={{
        backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-main)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>User</th>
              <th style={{ padding: '16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</th>
              <th style={{ padding: '16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Role</th>
              <th style={{ padding: '16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Created</th>
              <th style={{ padding: '16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {registeredUsers.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
                  No users registered yet.
                </td>
              </tr>
            ) : (
              registeredUsers.map((user, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img 
                      src={user.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`} 
                      alt={user.name}
                      style={{ width: '32px', height: '32px', borderRadius: '50%' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{user.name}</span>
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {user.email}
                  </td>
                  <td style={{ padding: '16px' }}>
                    <span style={{ 
                      padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase',
                      backgroundColor: user.role === 'admin' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(96, 165, 250, 0.15)',
                      color: user.role === 'admin' ? '#c084fc' : '#60a5fa',
                      border: user.role === 'admin' ? '1px solid rgba(192, 132, 252, 0.3)' : '1px solid rgba(96, 165, 250, 0.3)'
                    }}>
                      {user.role}
                    </span>
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleDelete(user.email)}
                      disabled={user.email === currentUser.email}
                      style={{
                        padding: '6px 12px', border: '1px solid rgba(248, 113, 113, 0.3)', borderRadius: '6px',
                        backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#f87171',
                        cursor: user.email === currentUser.email ? 'not-allowed' : 'pointer',
                        fontSize: '12px', fontWeight: '600', opacity: user.email === currentUser.email ? 0.5 : 1
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
