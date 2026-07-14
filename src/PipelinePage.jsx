import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { downloadCandidateResume } from './CandidatesPage.jsx';
import { useAuth } from './AuthContext';

const PIPELINE_STAGES = [
  { id: 'sourced', label: 'Sourced', color: 'var(--text-secondary)', bg: 'var(--bg-surface)', border: 'var(--border-color)', text: 'var(--text-secondary)' },
  { id: 'reached_out', label: 'Reached Out', color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(96, 165, 250, 0.3)', text: '#60a5fa' },
  { id: 'interviewing', label: 'Interviewing', color: '#fbbf24', bg: 'rgba(217, 119, 6, 0.15)', border: 'rgba(251, 191, 36, 0.3)', text: '#fbbf24' },
  { id: 'offer', label: 'Offer Extended', color: '#c084fc', bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(192, 132, 252, 0.3)', text: '#c084fc' },
  { id: 'hired', label: 'Hired', color: '#4ade80', bg: 'rgba(22, 163, 74, 0.15)', border: 'rgba(74, 222, 128, 0.3)', text: '#4ade80' },
  { id: 'rejected', label: 'Rejected', color: '#f87171', bg: 'rgba(220, 38, 38, 0.15)', border: 'rgba(248, 113, 113, 0.3)', text: '#f87171' }
];

export default function PipelinePage({ masterLeads, setMasterLeads, supabaseUrl, supabaseKey }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [viewingReasoning, setViewingReasoning] = useState(null);
  const [pipelineSearch, setPipelineSearch] = useState('');

  // Helper to get candidate status (default to 'sourced')
  const getCandidateStatus = (candidate) => {
    return candidate.status || 'sourced';
  };

  // Move candidate to a new stage
  const moveCandidate = (candidate, newStageId) => {
    const candidateUrl = candidate.linkedinUrl || candidate.url || '';
    const oldStage = candidate.status || 'sourced';
    
    const updatedLeads = masterLeads.map(lead => {
      const leadUrl = lead.linkedinUrl || lead.url || '';
      // Unique identifier match
      if (leadUrl === candidateUrl && (lead.firstName === candidate.firstName && lead.lastName === candidate.lastName)) {
        return { 
          ...lead, 
          status: newStageId,
          assignedRecruiterEmail: lead.assignedRecruiterEmail || currentUser?.email || 'dev@siliconpatterns.com'
        };
      }
      return lead;
    });

    setMasterLeads(updatedLeads);
    localStorage.setItem('siliconPatternsMasterDatabase', JSON.stringify(updatedLeads));

    // Log stage change activity if online
    const dbUrl = supabaseUrl || localStorage.getItem('siliconPatternsSupabaseUrl');
    const dbKey = supabaseKey || localStorage.getItem('siliconPatternsSupabaseKey');
    if (dbUrl && dbKey) {
      import('./supabase.js').then(({ logRecruiterActivity }) => {
        let skillArray = [];
        if (candidate.skills) {
          if (Array.isArray(candidate.skills)) {
            skillArray = candidate.skills.map(s => typeof s === 'string' ? s : (s.name || s.title || '')).filter(Boolean);
          } else {
            skillArray = String(candidate.skills).split(',').map(s => s.trim()).filter(Boolean);
          }
        }

        logRecruiterActivity(dbUrl, dbKey, {
          recruiterEmail: currentUser?.email || 'dev@siliconpatterns.com',
          candidateLinkedinUrl: candidateUrl,
          candidateName: `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Candidate',
          actionType: 'stage_change',
          fromStage: oldStage,
          toStage: newStageId,
          skills: skillArray
        }, currentUser?.accessToken).catch(e => console.error(e));
      });
    }
  };

  // Handle stage change from dropdown selector
  const handleStageSelect = (candidate, e) => {
    moveCandidate(candidate, e.target.value);
  };

  // Drag and Drop Handlers
  const handleDragStart = (e, candidate) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      url: candidate.linkedinUrl || candidate.url || '',
      firstName: candidate.firstName,
      lastName: candidate.lastName
    }));
  };

  const handleDragOver = (e) => {
    e.preventDefault(); // Necessary to allow dropping
    e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)';
  };

  const handleDragLeave = (e) => {
    e.currentTarget.style.backgroundColor = 'var(--bg-main)';
  };

  const handleDrop = (e, newStageId) => {
    e.preventDefault();
    e.currentTarget.style.backgroundColor = 'var(--bg-main)';
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const candidateToMove = masterLeads.find(c => {
         const cUrl = c.linkedinUrl || c.url || '';
         return cUrl === data.url && c.firstName === data.firstName && c.lastName === data.lastName;
      });
      if (candidateToMove) {
        moveCandidate(candidateToMove, newStageId);
      }
    } catch(err) {
      console.error('Drop error:', err);
    }
  };

  // Filter candidates by search query
  const filteredLeads = useMemo(() => {
    if (!pipelineSearch.trim()) return masterLeads;
    const q = pipelineSearch.toLowerCase();
    return masterLeads.filter(c => {
      const name = `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase();
      const title = (c.currentTitle || c.jobTitle || c.headline || '').toLowerCase();
      return name.includes(q) || title.includes(q);
    });
  }, [masterLeads, pipelineSearch]);

  // Group candidates by their current stage
  const groupedCandidates = PIPELINE_STAGES.reduce((groups, stage) => {
    groups[stage.id] = filteredLeads.filter(c => getCandidateStatus(c) === stage.id);
    return groups;
  }, {});

  if (masterLeads.length === 0) {
    return (
      <div style={{ padding: '80px 20px', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>Empty Pipeline</h2>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>No candidates exist in your system to track yet. Go to Search to source them!</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 20px', maxWidth: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px', boxSizing: 'border-box', height: 'calc(100vh - 0px)', overflow: 'hidden' }}>
      
      {/* Page Header + Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexShrink: 0, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.02em', textAlign: 'left' }}>
            Recruitment Pipeline Board
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'left' }}>
            {pipelineSearch ? `Showing matches for "${pipelineSearch}" · ` : ''}Monitor and update candidate interview progress through pipeline columns.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </span>
            <input
              type="text"
              placeholder="Search by name or title..."
              value={pipelineSearch}
              onChange={e => setPipelineSearch(e.target.value)}
              style={{
                padding: '8px 12px 8px 32px', borderRadius: '6px', border: '1px solid var(--border-color)',
                fontSize: '13px', color: 'var(--text-primary)', outline: 'none', backgroundColor: 'var(--bg-main)',
                width: '240px', boxSizing: 'border-box',
              }}
            />
          </div>
          {pipelineSearch && (
            <button
              onClick={() => setPipelineSearch('')}
              style={{
                padding: '6px 12px', border: '1px solid var(--border-color)', borderRadius: '6px',
                backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)',
                cursor: 'pointer', fontSize: '12px', fontWeight: '500',
              }}
            >Clear</button>
          )}
        </div>
      </div>

      {/* Kanban Board Container */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', 
        gap: '12px', 
        overflowX: 'auto', 
        paddingBottom: '8px',
        alignItems: 'start',
        flex: 1,
        minHeight: 0,
      }}>
        {PIPELINE_STAGES.map(stage => {
          const candidatesInStage = groupedCandidates[stage.id] || [];

          return (
              <div 
                key={stage.id} 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.id)}
                style={{
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  maxHeight: 'calc(100vh - 160px)',
                  overflow: 'hidden',
                  transition: 'background-color 0.2s',
                }}
              >
              {/* Column Header */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                paddingBottom: '8px', 
                borderBottom: `2.5px solid ${stage.color}`,
                marginBottom: '4px'
              }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{stage.label}</span>
                <span style={{ 
                  fontSize: '11px', 
                  fontWeight: '800', 
                  backgroundColor: stage.bg, 
                  color: stage.text, 
                  border: `1px solid ${stage.border}`,
                  padding: '2px 8px', 
                  borderRadius: '10px' 
                }}>
                  {candidatesInStage.length}
                </span>
              </div>

              {/* Column Cards Container — scrolls internally */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1, minHeight: 0, paddingRight: '2px' }}>
                {candidatesInStage.length === 0 ? (
                  <div style={{ 
                    padding: '24px 10px', 
                    textAlign: 'center', 
                    fontSize: '11px', 
                    color: 'var(--text-secondary)',
                    border: '1px dashed var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-main)',
                    marginTop: '4px'
                  }}>
                    Drag/Move candidates here
                  </div>
                ) : (
                  candidatesInStage.map((candidate, cardIdx) => {
                    const hasAgentScore = candidate.agentScore !== undefined && candidate.agentScore !== null;
                    const score = hasAgentScore ? candidate.agentScore : (candidate.matchScore || 0);

                    // Score colors helper
                    const scoreColor = score >= 70 ? '#4ade80' : score >= 40 ? '#fbbf24' : 'var(--text-secondary)';
                    const scoreBg = score >= 70 ? 'rgba(22, 163, 74, 0.15)' : score >= 40 ? 'rgba(217, 119, 6, 0.15)' : 'var(--bg-surface)';

                    return (
                      <div 
                        key={cardIdx}
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, candidate)}
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          padding: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          transition: 'all 0.15s',
                          cursor: 'grab'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = 'var(--border-hover)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = 'var(--border-color)';
                        }}
                      >
                        {/* Card Top: Name + Score */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }} title={`${candidate.firstName || ''} ${candidate.lastName || ''}`}>
                            {candidate.firstName || 'Candidate'} {candidate.lastName || ''}
                          </span>
                          {hasAgentScore && (
                            <span style={{
                              fontSize: '10px', fontWeight: '800',
                              backgroundColor: scoreBg, color: scoreColor,
                              padding: '2px 5px', borderRadius: '4px', border: `1px solid ${scoreColor}40`,
                              display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0
                            }} title="AI Screened Score">
                              <span>{score}</span>
                            </span>
                          )}
                        </div>

                        {/* Card Middle: Headline/Job Title */}
                        <p style={{ 
                          margin: 0, 
                          fontSize: '11px', 
                          color: 'var(--text-secondary)', 
                          lineHeight: '1.3',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          minHeight: '28px'
                        }}>
                          {candidate.currentTitle || candidate.jobTitle || candidate.headline || 'ASIC Engineer'}
                        </p>

                        {/* Card Bottom Actions: Dropdown status + Quick Move arrows */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                          {/* Left quick move button */}
                          <button
                            onClick={() => {
                              const currentIndex = PIPELINE_STAGES.findIndex(s => s.id === stage.id);
                              if (currentIndex > 0) {
                                moveCandidate(candidate, PIPELINE_STAGES[currentIndex - 1].id);
                              }
                            }}
                            disabled={stage.id === PIPELINE_STAGES[0].id}
                            style={{
                              padding: '2px 5px', border: '1px solid var(--border-color)', borderRadius: '4px',
                              backgroundColor: 'var(--bg-surface)', cursor: stage.id === PIPELINE_STAGES[0].id ? 'not-allowed' : 'pointer',
                              fontSize: '10px', color: 'var(--text-secondary)', opacity: stage.id === PIPELINE_STAGES[0].id ? 0.3 : 1
                            }}
                          >
                            ◀
                          </button>

                          {/* Dropdown stage changer */}
                          <select
                            value={stage.id}
                            onChange={(e) => handleStageSelect(candidate, e)}
                            style={{
                              flexGrow: 1, padding: '3px 4px', border: '1px solid var(--border-color)', borderRadius: '4px',
                              fontSize: '10px', color: 'var(--text-primary)', outline: 'none', backgroundColor: 'var(--bg-surface)',
                              cursor: 'pointer', maxWidth: '90px'
                            }}
                          >
                            {PIPELINE_STAGES.map(s => (
                              <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                          </select>

                          {/* Right quick move button */}
                          <button
                            onClick={() => {
                              const currentIndex = PIPELINE_STAGES.findIndex(s => s.id === stage.id);
                              if (currentIndex < PIPELINE_STAGES.length - 1) {
                                moveCandidate(candidate, PIPELINE_STAGES[currentIndex + 1].id);
                              }
                            }}
                            disabled={stage.id === PIPELINE_STAGES[PIPELINE_STAGES.length - 1].id}
                            style={{
                              padding: '2px 5px', border: '1px solid var(--border-color)', borderRadius: '4px',
                              backgroundColor: 'var(--bg-surface)', cursor: stage.id === PIPELINE_STAGES[PIPELINE_STAGES.length - 1].id ? 'not-allowed' : 'pointer',
                              fontSize: '10px', color: 'var(--text-secondary)', opacity: stage.id === PIPELINE_STAGES[PIPELINE_STAGES.length - 1].id ? 0.3 : 1
                            }}
                          >
                            ▶
                          </button>
                        </div>

                        {/* Extra view details action */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px' }}>
                          <button
                            onClick={() => navigate('/candidates', { state: { highlightCandidateUrl: candidate.linkedinUrl || candidate.url } })}
                            style={{
                              flexGrow: 1, padding: '4px 0', border: '1px solid var(--border-color)', borderRadius: '4px',
                              backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)', cursor: 'pointer',
                              fontSize: '10px', fontWeight: '500', transition: 'background-color 0.1s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--bg-main)'}
                          >
                            View Details
                          </button>
                          <button
                            onClick={() => downloadCandidateResume(candidate)}
                            title="Download Word Resume"
                            style={{
                              padding: '4px 6px', border: '1px solid var(--border-color)', borderRadius: '4px',
                              backgroundColor: 'var(--bg-main)', color: 'var(--text-secondary)', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)';
                              e.currentTarget.style.color = 'var(--text-primary)';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.backgroundColor = 'var(--bg-main)';
                              e.currentTarget.style.color = 'var(--text-secondary)';
                            }}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#2b579a' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><text x="6" y="18" fontSize="9" fontWeight="900" fontFamily="sans-serif" fill="#2b579a" stroke="none">W</text></svg>
                          </button>
                          {candidate.agentReasoning && (
                            <button
                              onClick={() => setViewingReasoning({ candidate, reasoning: candidate.agentReasoning })}
                              style={{
                                padding: '4px 6px', border: '1px solid rgba(192, 132, 252, 0.3)', borderRadius: '4px',
                                backgroundColor: 'rgba(168, 85, 247, 0.1)', color: '#c084fc', cursor: 'pointer',
                                fontSize: '10px', fontWeight: '600'
                              }}
                              title="View AI Agent Screening reasoning"
                            >
                              AI
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal for detailed agent reasoning */}
      {viewingReasoning && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface)', borderRadius: '12px', maxWidth: '600px', width: '100%',
            maxHeight: '80vh', overflowY: 'auto', padding: '24px', border: '1px solid var(--border-color)',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
                AI Screening Rationale: {viewingReasoning.candidate.firstName} {viewingReasoning.candidate.lastName}
              </h3>
              {viewingReasoning.candidate.agentScore !== undefined && viewingReasoning.candidate.agentScore !== null && (
                <span style={{ fontSize: '13px', fontWeight: '800', color: '#c084fc', backgroundColor: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(192, 132, 252, 0.3)', padding: '4px 8px', borderRadius: '4px' }}>
                  Score: {viewingReasoning.candidate.agentScore}/100
                </span>
              )}
            </div>

            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', whiteSpace: 'pre-wrap', backgroundColor: 'var(--bg-main)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              {viewingReasoning.reasoning}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button 
                onClick={() => setViewingReasoning(null)} 
                style={{
                  padding: '6px 16px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', border: 'none',
                  borderRadius: '6px', fontSize: '12px', fontWeight: '500', cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
