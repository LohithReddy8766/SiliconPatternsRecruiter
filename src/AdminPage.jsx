import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { downloadCandidateResume } from './CandidatesPage.jsx';

export default function AdminPage({ masterLeads = [], supabaseUrl, supabaseKey }) {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('performance');
  const [activities, setActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [viewingCandidates, setViewingCandidates] = useState(null);

  const [approvedEmails, setApprovedEmails] = useState([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [newEmail, setNewEmail] = useState('');

  const [pendingUsers, setPendingUsers] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);

  // Guard (Admin only)
  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-primary)' }}>
        <h2>Unauthorized Access</h2>
        <p>You do not have administrator privileges to view this page.</p>
      </div>
    );
  }

  // Load activities from Supabase
  useEffect(() => {
    if (activeTab === 'performance' && supabaseUrl && supabaseKey) {
      setLoadingActivities(true);
      import('./supabase.js').then(({ fetchRecruiterActivities }) => {
        fetchRecruiterActivities(supabaseUrl, supabaseKey)
          .then(data => {
            setActivities(data);
          })
          .catch(err => {
            console.error("Failed to load recruiter activities:", err);
          })
          .finally(() => {
            setLoadingActivities(false);
          });
      }).catch(err => {
        console.error("Failed to dynamically import supabase module:", err);
        setLoadingActivities(false);
      });
    }
  }, [activeTab, supabaseUrl, supabaseKey]);

  // Load approved and pending emails
  useEffect(() => {
    if (activeTab === 'access' && supabaseUrl && supabaseKey) {
      setLoadingEmails(true);
      setLoadingPending(true);
      import('./supabase.js').then(({ getApprovedEmails, getPendingUsers }) => {
        getApprovedEmails(supabaseUrl, supabaseKey)
          .then(data => setApprovedEmails(data))
          .catch(err => console.error("Failed to load approved emails:", err))
          .finally(() => setLoadingEmails(false));
          
        getPendingUsers(supabaseUrl, supabaseKey)
          .then(data => setPendingUsers(data))
          .catch(err => {
            console.error("Failed to load pending users:", err);
            alert("Database Error loading pending users: " + err.message);
          })
          .finally(() => setLoadingPending(false));
      }).catch(err => {
        console.error("Failed to import supabase module:", err);
        setLoadingEmails(false);
        setLoadingPending(false);
      });
    }
  }, [activeTab, supabaseUrl, supabaseKey]);

  const handleAddEmail = async (e) => {
    e.preventDefault();
    if (!newEmail.trim() || !supabaseUrl || !supabaseKey) return;
    try {
      const { addApprovedEmail } = await import('./supabase.js');
      await addApprovedEmail(supabaseUrl, supabaseKey, newEmail);
      setApprovedEmails(prev => [...prev, { email: newEmail.toLowerCase().trim() }]);
      setNewEmail('');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRemoveEmail = async (emailToRemove) => {
    if (!supabaseUrl || !supabaseKey) return;
    if (!window.confirm(`Remove ${emailToRemove} from allowlist?`)) return;
    try {
      const { removeApprovedEmail } = await import('./supabase.js');
      await removeApprovedEmail(supabaseUrl, supabaseKey, emailToRemove);
      setApprovedEmails(prev => prev.filter(e => e.email !== emailToRemove));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleApprovePending = async (emailToApprove) => {
    if (!supabaseUrl || !supabaseKey) return;
    try {
      const { addApprovedEmail, removePendingUser } = await import('./supabase.js');
      await addApprovedEmail(supabaseUrl, supabaseKey, emailToApprove);
      await removePendingUser(supabaseUrl, supabaseKey, emailToApprove);
      setApprovedEmails(prev => [...prev, { email: emailToApprove.toLowerCase().trim() }]);
      setPendingUsers(prev => prev.filter(e => e.email !== emailToApprove));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDenyPending = async (emailToDeny) => {
    if (!supabaseUrl || !supabaseKey) return;
    if (!window.confirm(`Deny access for ${emailToDeny}?`)) return;
    try {
      const { removePendingUser } = await import('./supabase.js');
      await removePendingUser(supabaseUrl, supabaseKey, emailToDeny);
      setPendingUsers(prev => prev.filter(e => e.email !== emailToDeny));
    } catch (err) {
      alert(err.message);
    }
  };

  // Group candidates by recruiter
  const recruiterStats = React.useMemo(() => {
    const stats = {};

    // Make sure we have a fallback for dev/unassigned
    const fallbackEmail = 'dev@siliconpatterns.com';
    if (!stats[fallbackEmail]) {
      stats[fallbackEmail] = {
        name: 'Developer Mode Recruiter',
        email: fallbackEmail,
        picture: '',
        sourced: 0,
        reached_out: 0,
        interviewing: 0,
        offer: 0,
        hired: 0,
        rejected: 0,
        others: 0,
        total: 0,
        skills: new Set()
      };
    }

    masterLeads.forEach(cand => {
      let recEmail = String(cand.assignedRecruiterEmail || cand.assigned_recruiter_email || '').toLowerCase().trim();
      if (!recEmail) {
        recEmail = fallbackEmail;
      }

      if (!stats[recEmail]) {
        stats[recEmail] = {
          name: recEmail.split('@')[0],
          email: recEmail,
          picture: '',
          sourced: 0,
          reached_out: 0,
          interviewing: 0,
          offer: 0,
          hired: 0,
          rejected: 0,
          others: 0,
          total: 0,
          skills: new Set()
        };
      }

      // Add to counts
      stats[recEmail].total += 1;
      const status = String(cand.status || 'sourced').toLowerCase();
      if (status === 'sourced') {
        stats[recEmail].sourced += 1;
      } else if (status === 'reached_out') {
        stats[recEmail].reached_out += 1;
      } else if (status === 'interviewing') {
        stats[recEmail].interviewing += 1;
      } else if (status === 'offer') {
        stats[recEmail].offer += 1;
      } else if (status === 'hired') {
        stats[recEmail].hired += 1;
      } else if (status === 'rejected') {
        stats[recEmail].rejected += 1;
      } else {
        stats[recEmail].others += 1;
      }

      // Parse and add skills
      if (cand.skills) {
        let skillArray = [];
        if (Array.isArray(cand.skills)) {
          skillArray = cand.skills.map(s => typeof s === 'string' ? s : (s.name || s.title || '')).filter(Boolean);
        } else {
          skillArray = String(cand.skills).split(',').map(s => s.trim()).filter(Boolean);
        }
        skillArray.forEach(sk => {
          if (stats[recEmail].skills.size < 12) { // Limit to top 12 core skills
            stats[recEmail].skills.add(sk);
          }
        });
      }
    });

    return Object.values(stats);
  }, [masterLeads]);

  // Clean transition naming for timeline activity
  const formatActionDescription = (act) => {
    switch (act.actionType) {
      case 'sourced':
        return `sourced candidate ${act.candidateName}`;
      case 'stage_change':
        const fromLabel = String(act.fromStage).replace('_', ' ');
        const toLabel = String(act.toStage).replace('_', ' ');
        return `moved candidate ${act.candidateName} from ${fromLabel} to ${toLabel}`;
      case 'evaluated':
        return `completed AI evaluation screening for ${act.candidateName}`;
      case 'outreach':
        return `generated customized outreach pitch for ${act.candidateName}`;
      default:
        return `performed action "${act.actionType}" on candidate ${act.candidateName}`;
    }
  };

  return (
    <div style={{ padding: '28px 20px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header */}
      <div>
        <h1 style={{ margin: '0 0 8px', fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.02em', textAlign: 'left' }}>
          Admin Dashboard
        </h1>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'left' }}>
          Monitor recruiter team activities, track candidate management performance, and manage registered portal accounts.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '16px' }}>
        <button
          onClick={() => setActiveTab('performance')}
          style={{
            border: 'none', background: 'none', padding: '12px 16px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
            color: activeTab === 'performance' ? 'var(--accent)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'performance' ? '2.5px solid var(--accent)' : '2.5px solid transparent',
            transition: 'all 0.15s ease'
          }}
        >
          Team Performance Analytics
        </button>
        <button
          onClick={() => setActiveTab('access')}
          style={{
            border: 'none', background: 'none', padding: '12px 16px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
            color: activeTab === 'access' ? 'var(--accent)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'access' ? '2.5px solid var(--accent)' : '2.5px solid transparent',
            transition: 'all 0.15s ease'
          }}
        >
          Access Management
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'performance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {/* Recruiter Stats Section */}
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', textAlign: 'left' }}>
              Recruiter Output Metrics
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
              {recruiterStats.map((rec, i) => (
                <div key={i} style={{
                  backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '12px',
                  padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', transition: 'all 0.2s'
                }}>
                  {/* Recruiter Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img 
                      src={rec.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(rec.name)}&background=random`} 
                      alt={rec.name}
                      style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
                    />
                    <div style={{ textAlign: 'left' }}>
                      <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', display: 'block' }}>{rec.name}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{rec.email}</span>
                    </div>
                  </div>

                  {/* Visual Status Bars */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { id: 'sourced', label: 'Sourced', color: 'var(--text-secondary)' },
                      { id: 'reached_out', label: 'Reached Out', color: '#60a5fa' },
                      { id: 'interviewing', label: 'Interviewing', color: '#fbbf24' },
                      { id: 'offer', label: 'Offer Extended', color: '#c084fc' },
                      { id: 'hired', label: 'Hired', color: '#4ade80' },
                      { id: 'rejected', label: 'Rejected', color: '#f87171' }
                    ].map(stage => {
                      const count = rec[stage.id] || 0;
                      return (
                        <div 
                          key={stage.id}
                          onClick={() => {
                            const list = masterLeads.filter(cand => {
                              let recEmail = String(cand.assignedRecruiterEmail || cand.assigned_recruiter_email || '').toLowerCase().trim();
                              const targetEmail = rec.email.toLowerCase().trim();
                              if (!recEmail) recEmail = 'dev@siliconpatterns.com';
                              
                              const candStatus = String(cand.status || 'sourced').toLowerCase();
                              return (recEmail === targetEmail) && (candStatus === stage.id);
                            });
                            setViewingCandidates({ recruiterName: rec.name, statusLabel: stage.label, candidates: list });
                          }}
                          style={{ cursor: 'pointer', padding: '4px 6px', borderRadius: '6px', transition: 'background-color 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-main)'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                          title={`Click to view candidate list for ${stage.label}`}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                            <span>{stage.label}</span>
                            <span style={{ fontWeight: '600', color: stage.color }}>{count}</span>
                          </div>
                          <div style={{ height: '5px', backgroundColor: 'var(--bg-main)', borderRadius: '2.5px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', backgroundColor: stage.color, width: `${rec.total > 0 ? (count / rec.total) * 100 : 0}%`, borderRadius: '2.5px' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary Totals */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Total Managed Leads</span>
                    <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--accent)' }}>{rec.total}</span>
                  </div>

                  {/* Targeted Talents Section */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px dashed var(--border-color)', paddingTop: '12px', marginTop: '2px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>
                      Targeted Talent (Skills)
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', minHeight: '40px' }}>
                      {rec.skills.size === 0 ? (
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No technical skills targeted yet</span>
                      ) : (
                        Array.from(rec.skills).map((skill, sIdx) => (
                          <span key={sIdx} style={{
                            padding: '3px 6px', fontSize: '10px', borderRadius: '4px', fontWeight: '600',
                            backgroundColor: 'rgba(0, 229, 255, 0.1)', color: 'var(--accent)',
                            border: '1px solid rgba(0, 229, 255, 0.2)'
                          }}>
                            {skill}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Logs Timeline Feed */}
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', textAlign: 'left' }}>
              Live Recruiter Activity Stream
            </h3>

            <div style={{
              backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '12px',
              padding: '24px', minHeight: '160px', position: 'relative'
            }}>
              {loadingActivities ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100px', flexDirection: 'column', gap: '10px' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="spinning-loader" style={{ animation: 'spin 1.2s linear infinite' }}>
                    <line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                  </svg>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Loading database activities...</span>
                </div>
              ) : activities.length === 0 ? (
                <div style={{ padding: '40px 10px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  {!supabaseUrl ? (
                    <span>Supabase connection is offline. Connect a database to track live recruiter activities.</span>
                  ) : (
                    <span>No activities logged in the database yet. Perform candidate searches or move pipeline cards to log activities.</span>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative' }}>
                  {/* Vertical line indicator */}
                  <div style={{ position: 'absolute', top: '8px', bottom: '8px', left: '16px', width: '2px', backgroundColor: 'var(--border-color)' }} />
                  
                  {activities.slice(0, 30).map((act, idx) => {
                    const recruiterName = act.recruiterEmail.split('@')[0];
                    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(recruiterName)}&background=random`;

                    return (
                      <div key={idx} style={{ display: 'flex', gap: '16px', position: 'relative', zIndex: 1, alignItems: 'flex-start' }}>
                        {/* Avatar */}
                        <img 
                          src={avatarUrl} 
                          alt={recruiterName} 
                          style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--bg-surface)' }} 
                        />
                        
                        {/* Action Content */}
                        <div style={{ flex: 1, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                            <strong style={{ fontWeight: '700' }}>{recruiterName}</strong> ({act.recruiterEmail}) {formatActionDescription(act)}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {new Date(act.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {activeTab === 'access' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Pending Approvals */}
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', textAlign: 'left' }}>
              Pending Access Requests
            </h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'left' }}>
              These users have created accounts and are waiting for administrator approval to access the workspace.
            </p>

            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-main)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Email Address</th>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingPending ? (
                    <tr>
                      <td colSpan="2" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading pending requests...</td>
                    </tr>
                  ) : pendingUsers.length === 0 ? (
                    <tr>
                      <td colSpan="2" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>No pending requests.</td>
                    </tr>
                  ) : (
                    pendingUsers.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--text-primary)', fontWeight: '500' }}>{item.email}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleApprovePending(item.email)}
                            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.3)', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#34d399', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleDenyPending(item.email)}
                            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(248, 113, 113, 0.3)', backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#f87171', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                          >
                            Deny
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', textAlign: 'left' }}>
              Approved Emails Allowlist
            </h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'left' }}>
              Only emails listed here will be allowed to receive OTP verification codes to log in.
            </p>

            <form onSubmit={handleAddEmail} style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
              <input 
                type="email" 
                required
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="developer@siliconpatterns.com"
                style={{ flex: 1, padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '14px' }}
              />
              <button 
                type="submit"
                style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
              >
                Add Email
              </button>
            </form>

            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-main)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Email Address</th>
                    <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingEmails ? (
                    <tr>
                      <td colSpan="2" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading allowlist...</td>
                    </tr>
                  ) : approvedEmails.length === 0 ? (
                    <tr>
                      <td colSpan="2" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>No approved emails yet.</td>
                    </tr>
                  ) : (
                    approvedEmails.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--text-primary)', fontWeight: '500' }}>{item.email}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleRemoveEmail(item.email)}
                            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(248, 113, 113, 0.3)', backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#f87171', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Candidates Explorer Modal */}
      {viewingCandidates && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '20px',
          backdropFilter: 'blur(5px)'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface)', borderRadius: '12px', maxWidth: '640px', width: '100%',
            maxHeight: '80vh', overflowY: 'auto', padding: '28px', border: '1px solid var(--border-color)',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: '20px'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
              <div style={{ textAlign: 'left' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  {viewingCandidates.statusLabel} Candidates
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Managed by {viewingCandidates.recruiterName}
                </p>
              </div>
              <button
                onClick={() => setViewingCandidates(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >×</button>
            </div>

            {/* Modal Body: Candidates List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '50vh', paddingRight: '4px' }}>
              {viewingCandidates.candidates.length === 0 ? (
                <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic' }}>
                  No candidates currently in this stage.
                </div>
              ) : (
                viewingCandidates.candidates.map((cand, cIdx) => {
                  const candName = `${cand.firstName || ''} ${cand.lastName || ''}`.trim() || 'Candidate';
                  const candTitle = cand.currentTitle || cand.jobTitle || cand.headline || 'Engineer';
                  const candUrl = cand.linkedinUrl || cand.url;

                  return (
                    <div key={cIdx} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 16px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                      borderRadius: '8px', gap: '16px'
                    }}>
                      <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {candName}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {candTitle}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                        {candUrl && (
                          <a 
                            href={candUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              padding: '6px 12px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                              borderRadius: '6px', fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)',
                              textDecoration: 'none'
                            }}
                          >
                            LinkedIn ↗
                          </a>
                        )}
                        <button
                          onClick={() => downloadCandidateResume(cand)}
                          title="Download Word Resume"
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '30px', height: '30px',
                            backgroundColor: 'var(--bg-surface)', borderRadius: '6px', border: '1px solid var(--border-color)',
                            color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.borderColor = 'var(--border-hover)';
                            e.currentTarget.style.color = 'var(--accent)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'var(--border-color)';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#2b579a' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><text x="6" y="18" fontSize="9" fontWeight="900" fontFamily="sans-serif" fill="#2b579a" stroke="none">W</text></svg>
                        </button>
                        <button
                          onClick={() => {
                            setViewingCandidates(null);
                            navigate('/candidates', { state: { highlightCandidateUrl: candUrl } });
                          }}
                          style={{
                            padding: '6px 12px', backgroundColor: 'var(--accent)', border: 'none',
                            borderRadius: '6px', fontSize: '12px', fontWeight: '600', color: 'var(--accent-fg)',
                            cursor: 'pointer'
                          }}
                        >
                          View Pool
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
