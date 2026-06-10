import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const PIPELINE_STAGES = [
  { id: 'sourced', label: 'Sourced', color: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb', text: '#374151' },
  { id: 'reached_out', label: 'Reached Out', color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  { id: 'interviewing', label: 'Interviewing', color: '#d97706', bg: '#fef3c7', border: '#fde68a', text: '#92400e' },
  { id: 'offer', label: 'Offer Extended', color: '#c084fc', bg: '#faf5ff', border: '#e9d5ff', text: '#6b21a8' },
  { id: 'hired', label: 'Hired', color: '#16a34a', bg: '#dcfce7', border: '#bbf7d0', text: '#166534' },
  { id: 'rejected', label: 'Rejected', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', text: '#991b1b' }
];

export default function PipelinePage({ masterLeads, setMasterLeads }) {
  const navigate = useNavigate();
  const [viewingReasoning, setViewingReasoning] = useState(null);

  // Helper to get candidate status (default to 'sourced')
  const getCandidateStatus = (candidate) => {
    return candidate.status || 'sourced';
  };

  // Move candidate to a new stage
  const moveCandidate = (candidate, newStageId) => {
    const candidateUrl = candidate.linkedinUrl || candidate.url || '';
    
    const updatedLeads = masterLeads.map(lead => {
      const leadUrl = lead.linkedinUrl || lead.url || '';
      // Unique identifier match
      if (leadUrl === candidateUrl && (lead.firstName === candidate.firstName && lead.lastName === candidate.lastName)) {
        return { ...lead, status: newStageId };
      }
      return lead;
    });

    setMasterLeads(updatedLeads);
    localStorage.setItem('siliconPatternsMasterDatabase', JSON.stringify(updatedLeads));
  };

  // Handle stage change from dropdown selector
  const handleStageSelect = (candidate, e) => {
    moveCandidate(candidate, e.target.value);
  };

  // Group candidates by their current stage
  const groupedCandidates = PIPELINE_STAGES.reduce((groups, stage) => {
    groups[stage.id] = masterLeads.filter(c => getCandidateStatus(c) === stage.id);
    return groups;
  }, {});

  if (masterLeads.length === 0) {
    return (
      <div style={{ padding: '80px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>📋</div>
        <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: '700', color: '#18181b' }}>Empty Pipeline</h2>
        <p style={{ margin: 0, fontSize: '14px', color: '#71717a' }}>No candidates exist in your system to track yet. Go to Search to source them!</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 20px', maxWidth: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px', boxSizing: 'border-box' }}>
      
      {/* Page Header */}
      <div>
        <h1 style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: '700', color: '#18181b', letterSpacing: '-0.02em', textAlign: 'left' }}>
          Recruitment Pipeline Board
        </h1>
        <p style={{ margin: 0, fontSize: '13px', color: '#71717a', textAlign: 'left' }}>
          Monitor and update candidate interview progress through pipeline columns.
        </p>
      </div>

      {/* Kanban Board Container */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(6, minmax(220px, 1fr))', 
        gap: '16px', 
        overflowX: 'auto', 
        paddingBottom: '16px',
        alignItems: 'start',
        minHeight: '70vh'
      }}>
        {PIPELINE_STAGES.map(stage => {
          const candidatesInStage = groupedCandidates[stage.id] || [];

          return (
            <div 
              key={stage.id} 
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '12px',
                minHeight: '500px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
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
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>{stage.label}</span>
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

              {/* Column Cards Container */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flexGrow: 1 }}>
                {candidatesInStage.length === 0 ? (
                  <div style={{ 
                    padding: '24px 10px', 
                    textAlign: 'center', 
                    fontSize: '11px', 
                    color: '#94a3b8',
                    border: '1px dashed #cbd5e1',
                    borderRadius: '8px',
                    backgroundColor: '#fafafa',
                    marginTop: '4px'
                  }}>
                    Drag/Move candidates here
                  </div>
                ) : (
                  candidatesInStage.map((candidate, cardIdx) => {
                    const hasAgentScore = candidate.agentScore !== undefined;
                    const score = candidate.matchScore || 0;

                    // Score colors helper
                    const scoreColor = score >= 70 ? '#16a34a' : score >= 40 ? '#ca8a04' : '#6b7280';
                    const scoreBg = score >= 70 ? '#dcfce7' : score >= 40 ? '#fef9c3' : '#f3f4f6';

                    return (
                      <div 
                        key={cardIdx}
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          padding: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          transition: 'transform 0.15s, box-shadow 0.15s',
                          cursor: 'default'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.08), 0 2px 4px -1px rgba(0,0,0,0.03)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
                        }}
                      >
                        {/* Card Top: Name + Score */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }} title={`${candidate.firstName || ''} ${candidate.lastName || ''}`}>
                            {candidate.firstName || 'Candidate'} {candidate.lastName || ''}
                          </span>
                          <span style={{
                            fontSize: '10px', fontWeight: '800',
                            backgroundColor: scoreBg, color: scoreColor,
                            padding: '2px 5px', borderRadius: '4px',
                            display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0
                          }} title={hasAgentScore ? "AI Screened Score" : "Heuristic Score"}>
                            {hasAgentScore && <span>🤖</span>}
                            <span>{score}</span>
                          </span>
                        </div>

                        {/* Card Middle: Headline/Job Title */}
                        <p style={{ 
                          margin: 0, 
                          fontSize: '11px', 
                          color: '#64748b', 
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
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
                              padding: '2px 5px', border: '1px solid #e2e8f0', borderRadius: '4px',
                              backgroundColor: '#fff', cursor: stage.id === PIPELINE_STAGES[0].id ? 'not-allowed' : 'pointer',
                              fontSize: '10px', color: '#64748b', opacity: stage.id === PIPELINE_STAGES[0].id ? 0.3 : 1
                            }}
                          >
                            ◀
                          </button>

                          {/* Dropdown stage changer */}
                          <select
                            value={stage.id}
                            onChange={(e) => handleStageSelect(candidate, e)}
                            style={{
                              flexGrow: 1, padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: '4px',
                              fontSize: '10px', color: '#334155', outline: 'none', backgroundColor: '#fff',
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
                              padding: '2px 5px', border: '1px solid #e2e8f0', borderRadius: '4px',
                              backgroundColor: '#fff', cursor: stage.id === PIPELINE_STAGES[PIPELINE_STAGES.length - 1].id ? 'not-allowed' : 'pointer',
                              fontSize: '10px', color: '#64748b', opacity: stage.id === PIPELINE_STAGES[PIPELINE_STAGES.length - 1].id ? 0.3 : 1
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
                              width: '100%', padding: '4px 0', border: 'none', borderRadius: '4px',
                              backgroundColor: '#f8fafc', color: '#2563eb', cursor: 'pointer',
                              fontSize: '10px', fontWeight: '600', transition: 'background-color 0.1s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#eff6ff'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                          >
                            View Details 🔍
                          </button>
                          {candidate.agentReasoning && (
                            <button
                              onClick={() => setViewingReasoning({ candidate, reasoning: candidate.agentReasoning })}
                              style={{
                                padding: '4px 6px', border: 'none', borderRadius: '4px',
                                backgroundColor: '#faf5ff', color: '#a855f7', cursor: 'pointer',
                                fontSize: '10px', fontWeight: '600'
                              }}
                              title="View AI Agent Screening reasoning"
                            >
                              🤖
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
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#fff', borderRadius: '12px', maxWidth: '600px', width: '100%',
            maxHeight: '80vh', overflowY: 'auto', padding: '24px', border: '1px solid #e4e4e7',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e4e4e7', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#18181b' }}>
                AI Screening Rationale: {viewingReasoning.candidate.firstName} {viewingReasoning.candidate.lastName}
              </h3>
              <span style={{ fontSize: '13px', fontWeight: '800', color: '#a855f7', backgroundColor: '#faf5ff', padding: '4px 8px', borderRadius: '4px' }}>
                Score: {viewingReasoning.candidate.matchScore}/100
              </span>
            </div>

            <div style={{ fontSize: '13px', color: '#3f3f46', lineHeight: '1.6', whiteSpace: 'pre-wrap', backgroundColor: '#fafafa', padding: '14px', borderRadius: '8px', border: '1px solid #e4e4e7' }}>
              {viewingReasoning.reasoning}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button 
                onClick={() => setViewingReasoning(null)} 
                style={{
                  padding: '6px 16px', backgroundColor: '#18181b', color: '#fff', border: 'none',
                  borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer'
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
