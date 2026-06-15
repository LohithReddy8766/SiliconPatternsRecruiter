import React, { useState, useEffect, useRef, useMemo } from 'react';
import { runCandidateAgent } from './agent.js';

export default function AIAgentPage({ masterLeads, setMasterLeads }) {
  // Config state
  const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile');
  
  // Job Description / Screening Requirement
  const [jobDescription, setJobDescription] = useState(
    "Senior ASIC Verification Engineer.\nRequirements:\n- 5+ years of active design verification experience\n- Strong proficiency in UVM and SystemVerilog architectures\n- Experience with PCIe protocol (Gen4/Gen5) validation\n- Excellent debug and testbench layout skills"
  );

  // Selected candidates to run agent on
  const [selectedCandidateIds, setSelectedCandidateIds] = useState([]);

  // Search & Filter State for candidate pool selection
  const [poolSearch, setPoolSearch] = useState('');
  const [poolStatusFilter, setPoolStatusFilter] = useState('all');
  const [poolScreeningFilter, setPoolScreeningFilter] = useState('all');

  // Filtered candidate list for selection
  const filteredPool = useMemo(() => {
    return masterLeads.map((candidate, idx) => ({ candidate, idx })).filter(({ candidate }) => {
      // 1. Text Search (name & current title)
      if (poolSearch.trim()) {
        const q = poolSearch.toLowerCase();
        const firstName = candidate.firstName || '';
        const lastName = candidate.lastName || '';
        const name = `${firstName} ${lastName}`.toLowerCase();
        const title = (candidate.currentTitle || candidate.jobTitle || candidate.headline || '').toLowerCase();
        if (!name.includes(q) && !title.includes(q)) return false;
      }

      // 2. Status Filter
      if (poolStatusFilter !== 'all') {
        const status = candidate.status || 'sourced';
        if (status !== poolStatusFilter) return false;
      }

      // 3. AI Screening Filter
      if (poolScreeningFilter !== 'all') {
        const hasScore = candidate.agentScore !== undefined;
        if (poolScreeningFilter === 'unscreened' && hasScore) return false;
        if (poolScreeningFilter === 'screened' && !hasScore) return false;
      }

      return true;
    });
  }, [masterLeads, poolSearch, poolStatusFilter, poolScreeningFilter]);

  // Running states
  const [isRunning, setIsRunning] = useState(false);
  const [currentRunningIndex, setCurrentRunningIndex] = useState(null);
  const [agentLogs, setAgentLogs] = useState([]); // Array of log messages for current run
  const [agentResults, setAgentResults] = useState({}); // candidateUrl -> { score, reasoning, logs }
  const [viewingReasoning, setViewingReasoning] = useState(null); // Candidate object being viewed

  const consoleEndRef = useRef(null);

  // Load saved results from localStorage on mount
  useEffect(() => {

    const savedModel = localStorage.getItem('siliconPatternsGroqModel');
    if (savedModel) setSelectedModel(savedModel);

    const savedJD = localStorage.getItem('siliconPatternsGroqJd');
    if (savedJD) setJobDescription(savedJD);
  }, []);

  // Scroll live console to the bottom
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [agentLogs]);

  // Handle Model Config save
  const handleSaveConfig = () => {
    localStorage.setItem('siliconPatternsGroqModel', selectedModel);
    localStorage.setItem('siliconPatternsGroqJd', jobDescription);
    alert('Agent configuration saved successfully!');
  };

  // Toggle selection for candidates
  const toggleCandidateSelection = (candidateId) => {
    setSelectedCandidateIds(prev => 
      prev.includes(candidateId) 
        ? prev.filter(id => id !== candidateId) 
        : [...prev, candidateId]
    );
  };

  const handleSelectAll = () => {
    const filteredIndexes = filteredPool.map(item => item.idx);
    const allSelected = filteredIndexes.every(idx => selectedCandidateIds.includes(idx));
    
    if (allSelected) {
      // Deselect only the filtered items
      setSelectedCandidateIds(prev => prev.filter(idx => !filteredIndexes.includes(idx)));
    } else {
      // Select all filtered items (merge with existing selections)
      setSelectedCandidateIds(prev => [...new Set([...prev, ...filteredIndexes])]);
    }
  };

  // Run the agent on selected candidates
  const handleRunAgent = async (e) => {
    e.preventDefault();
    const currentApiKey = localStorage.getItem('siliconPatternsGroqApiKey') || import.meta.env.VITE_GROQ_API_TOKEN || '';
    if (!currentApiKey.trim()) {
      alert("Please provide a valid Groq API Key in Settings to proceed.");
      return;
    }
    if (selectedCandidateIds.length === 0) {
      alert("Please select at least one candidate to screen.");
      return;
    }

    setIsRunning(true);
    setAgentLogs([]);
    const newResults = { ...agentResults };

    // Loop through each selected candidate sequentially
    for (let i = 0; i < selectedCandidateIds.length; i++) {
      const idx = selectedCandidateIds[i];
      const candidate = masterLeads[idx];
      const candUrl = candidate.linkedinUrl || candidate.url || `candidate-${idx}`;

      setCurrentRunningIndex(idx);
      setAgentLogs(prev => [
        ...prev,
        { type: 'system', text: `--------------------------------------------------` },
        { type: 'system', text: `LAUNCHING AI AGENT FOR: ${candidate.firstName || ''} ${candidate.lastName || ''}` },
        { type: 'system', text: `--------------------------------------------------` }
      ]);

      try {
        const candidateLogs = [];
        
        // Execute the ReAct loop
        const result = await runCandidateAgent({
          apiKey: currentApiKey,
          model: selectedModel,
          roleRequirements: jobDescription,
          candidate,
          onStep: (stepInfo) => {
            let logText = "";
            let logType = "info";

            if (stepInfo.type === 'start') {
              logText = `[Agent] ${stepInfo.message}`;
              logType = 'start';
            } else if (stepInfo.type === 'thought') {
              logText = `🧠 Thought: ${stepInfo.message}`;
              logType = 'thought';
            } else if (stepInfo.type === 'tool_call') {
              logText = `🛠️ Action: Calling ${stepInfo.message}`;
              logType = 'tool';
            } else if (stepInfo.type === 'observation') {
              logText = `📊 Observation: ${stepInfo.message}`;
              logType = 'observation';
            } else if (stepInfo.type === 'warning') {
              logText = `⚠️ Warning: ${stepInfo.message}`;
              logType = 'warning';
            } else if (stepInfo.type === 'error') {
              logText = `🚨 Error: ${stepInfo.message}`;
              logType = 'error';
            } else if (stepInfo.type === 'final') {
              logText = `🎯 Final Recommendation Compiled! Score: ${stepInfo.result.score}/100`;
              logType = 'final';
            }

            const newLog = { type: logType, text: logText };
            candidateLogs.push(newLog);
            setAgentLogs(prev => [...prev, newLog]);
          }
        });

        // Store result
        newResults[candUrl] = {
          score: result.score,
          reasoning: result.reasoning,
          logs: candidateLogs
        };
        setAgentResults({ ...newResults });

      } catch (err) {
        console.error("Agent failed for candidate", candidate, err);
        const errorLog = { type: 'error', text: `🚨 Agent run failed: ${err.message}` };
        setAgentLogs(prev => [...prev, errorLog]);

        newResults[candUrl] = {
          score: 0,
          reasoning: `Screening failed: ${err.message}`,
          logs: [errorLog]
        };
        setAgentResults({ ...newResults });
      }
    }

    setCurrentRunningIndex(null);
    setIsRunning(false);
    setAgentLogs(prev => [
      ...prev,
      { type: 'system', text: `==================================================` },
      { type: 'system', text: `🏁 AI AGENT SCREENING COMPLETED FOR ALL TARGETS!` },
      { type: 'system', text: `==================================================` }
    ]);
  };

  // Commit Agent Scores and Reasoning to Master Database (persists in state + localstorage)
  const handleCommitToDatabase = () => {
    const updatedLeads = masterLeads.map((candidate, idx) => {
      const candUrl = candidate.linkedinUrl || candidate.url || `candidate-${idx}`;
      const result = agentResults[candUrl];
      
      if (result) {
        return {
          ...candidate,
          agentScore: result.score,
          agentReasoning: result.reasoning,
          // Let's overwrite matchScore with agentScore for uniform representation if preferred, or keep both
          matchScore: result.score // override matchScore so it propagates directly into sorting/views
        };
      }
      return candidate;
    });

    setMasterLeads(updatedLeads);
    localStorage.setItem('siliconPatternsMasterDatabase', JSON.stringify(updatedLeads));
    alert('AI Agent scores and reasonings successfully integrated into your main Candidate Database!');
  };

  // Template loaders
  const loadTemplate = (title) => {
    let jd = "";
    if (title === 'ASIC DV') {
      jd = "Senior ASIC Verification Engineer.\nRequirements:\n- 5+ years of active design verification experience\n- Strong proficiency in UVM and SystemVerilog architectures\n- Experience with PCIe protocol (Gen4/Gen5) validation\n- Excellent debug and testbench layout skills";
    } else if (title === 'DFT') {
      jd = "DFT Lead Engineer.\nRequirements:\n- 6+ years of hardware DFT design & implementation\n- Expertise in scan insertion, ATPG, MBIST, and JTAG boundary scan\n- Proficient in Tessent tools or Synopsys DFTMAX\n- Experience working on advanced nodes (7nm or lower)";
    } else if (title === 'Physical Design') {
      jd = "Physical Design (PD) Engineer.\nRequirements:\n- 4+ years of ASIC physical design execution\n- Strong hands-on experience in Floorplanning, CTS, Routing, and STA\n- Expertise in Innovus or IC Compiler II\n- Working knowledge of DRC/LVS physical verification tools (Calibre)";
    }
    setJobDescription(jd);
  };

  return (
    <div style={{ padding: '28px 20px', maxWidth: '1400px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr', gap: '28px' }}>
      
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Autonomous AI Agent Screener
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
            Powered by Groq. Watch a true ReAct agent plan, call tools, analyze files, and grade candidates live.
          </p>
        </div>
        
        {Object.keys(agentResults).length > 0 && (
          <button 
            onClick={handleCommitToDatabase} 
            style={{ 
              padding: '10px 20px', 
              backgroundColor: 'var(--accent)', 
              color: 'var(--accent-fg)', 
              border: 'none', 
              borderRadius: '6px', 
              cursor: 'pointer', 
              fontSize: '13px', 
              fontWeight: '500',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}
          >
            💾 Commit Scores to Database
          </button>
        )}
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', 
        gap: '24px', 
        alignItems: 'start' 
      }}>
        
        {/* Left Column: Config, Target requirements, and Candidate Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Card 1: Configuration */}
          <div style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 16px', color: 'var(--text-primary)' }}>⚙️ Model Setup</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Reasoning Engine Model
                  </label>
                  <select 
                    value={selectedModel} 
                    onChange={e => setSelectedModel(e.target.value)} 
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-color)',
                      fontSize: '13px', color: 'var(--text-primary)', outline: 'none', backgroundColor: 'var(--bg-main)'
                    }}
                  >
                    <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Recommended - High reasoning)</option>
                    <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (Fastest & high limits)</option>
                    <option value="gemma2-9b-it">gemma2-9b-it (Efficient generalist)</option>
                    <option value="mixtral-8x7b-32768">mixtral-8x7b-32768 (High quality MoE)</option>
                  </select>
                </div>
                <button 
                  onClick={handleSaveConfig}
                  style={{
                    padding: '10px 16px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)',
                    borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500'
                  }}
                >
                  Save Config
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Screening Target */}
          <div style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>🎯 Screening Requirements</h2>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={() => loadTemplate('ASIC DV')} style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '4px', backgroundColor: 'var(--bg-main)', cursor: 'pointer' }}>DV</button>
                <button type="button" onClick={() => loadTemplate('DFT')} style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '4px', backgroundColor: 'var(--bg-main)', cursor: 'pointer' }}>DFT</button>
                <button type="button" onClick={() => loadTemplate('Physical Design')} style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '4px', backgroundColor: 'var(--bg-main)', cursor: 'pointer' }}>PD</button>
              </div>
            </div>
            
            <textarea
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
              placeholder="Describe the candidate requirements, skills, and target experience..."
              rows={6}
              style={{
                width: '100%', padding: '12px', boxSizing: 'border-box', borderRadius: '6px',
                border: '1px solid var(--border-color)', fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.5',
                outline: 'none', fontFamily: 'monospace', resize: 'vertical', backgroundColor: 'var(--bg-main)'
              }}
            />
          </div>

          {/* Card 3: Candidate Pool Selection */}
          <div style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>👥 Candidate Pool</h2>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-secondary)' }}>Select targets for autonomous evaluation</p>
              </div>
              {masterLeads.length > 0 && (
                <button 
                  type="button" 
                  onClick={handleSelectAll}
                  style={{
                    padding: '4px 10px', fontSize: '11px', border: '1px solid var(--border-color)',
                    borderRadius: '4px', backgroundColor: 'var(--bg-main)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: '600'
                  }}
                >
                  {filteredPool.length > 0 && filteredPool.map(item => item.idx).every(idx => selectedCandidateIds.includes(idx)) ? 'Deselect Filtered' : 'Select Filtered'}
                </button>
              )}
            </div>

            {/* Search and Filters for Candidate Pool */}
            {masterLeads.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                <input
                  type="text"
                  placeholder="🔍 Search candidate name or title..."
                  value={poolSearch}
                  onChange={e => setPoolSearch(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', boxSizing: 'border-box',
                    borderRadius: '6px', border: '1px solid var(--border-color)',
                    fontSize: '12px', color: 'var(--text-primary)', backgroundColor: 'var(--bg-main)',
                    outline: 'none'
                  }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <select
                    value={poolStatusFilter}
                    onChange={e => setPoolStatusFilter(e.target.value)}
                    style={{
                      width: '100%', padding: '7px 8px', borderRadius: '6px', border: '1px solid var(--border-color)',
                      fontSize: '11px', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-main)',
                      outline: 'none', cursor: 'pointer'
                    }}
                  >
                    <option value="all">All Stages</option>
                    <option value="sourced">Sourced</option>
                    <option value="reached_out">Reached Out</option>
                    <option value="interviewing">Interviewing</option>
                    <option value="offer">Offer Extended</option>
                    <option value="hired">Hired</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <select
                    value={poolScreeningFilter}
                    onChange={e => setPoolScreeningFilter(e.target.value)}
                    style={{
                      width: '100%', padding: '7px 8px', borderRadius: '6px', border: '1px solid var(--border-color)',
                      fontSize: '11px', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-main)',
                      outline: 'none', cursor: 'pointer'
                    }}
                  >
                    <option value="all">All AI Grades</option>
                    <option value="unscreened">Not Screened Yet</option>
                    <option value="screened">Screened by Agent</option>
                  </select>
                </div>
              </div>
            )}

            {masterLeads.length > 0 && (
              <button
                onClick={handleRunAgent}
                disabled={isRunning || selectedCandidateIds.length === 0}
                style={{
                  width: '100%', marginBottom: '16px', padding: '12px',
                  backgroundColor: isRunning ? 'var(--border-color)' : selectedCandidateIds.length === 0 ? 'var(--bg-surface)' : 'var(--accent)',
                  color: selectedCandidateIds.length === 0 && !isRunning ? 'var(--text-secondary)' : 'var(--accent-fg)',
                  border: selectedCandidateIds.length === 0 ? '1px solid var(--border-color)' : 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '500',
                  cursor: isRunning || selectedCandidateIds.length === 0 ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s'
                }}
              >
                {isRunning ? '🤖 Agent Executing Loop...' : `Launch Agent on ${selectedCandidateIds.length} Candidate(s)`}
              </button>
            )}

            {masterLeads.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
                No candidates available. Please run a scrape search first!
              </div>
            ) : filteredPool.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: '12px', fontStyle: 'italic' }}>
                No candidates match the active search/filters.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxH: '260px', overflowY: 'auto', paddingRight: '4px' }}>
                {filteredPool.map(({ candidate, idx }) => {
                  const isSelected = selectedCandidateIds.includes(idx);
                  const isCurrent = currentRunningIndex === idx;
                  const candUrl = candidate.linkedinUrl || candidate.url || `candidate-${idx}`;
                  const result = agentResults[candUrl];

                  return (
                    <div 
                      key={idx} 
                      onClick={() => !isRunning && toggleCandidateSelection(idx)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', borderRadius: '8px', border: isCurrent ? '1.5px solid var(--accent)' : '1px solid var(--border-color)',
                        backgroundColor: isCurrent ? 'rgba(0, 229, 255, 0.1)' : isSelected ? 'var(--bg-main)' : 'var(--bg-surface)',
                        cursor: isRunning ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isRunning}
                          onChange={() => {}} // handled by div onClick
                          style={{ cursor: isRunning ? 'not-allowed' : 'pointer' }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                            {candidate.firstName || 'Unknown'} {candidate.lastName || ''}
                          </span>
                          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {candidate.currentTitle || candidate.jobTitle || candidate.headline}
                          </p>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        {isCurrent && <span style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: '700', animation: 'pulse 1.5s infinite' }}>🤖 THINKING</span>}
                        {result && (
                          <span style={{
                            fontSize: '11px', fontWeight: '600',
                            backgroundColor: 'var(--bg-main)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-color)',
                            padding: '2px 6px', borderRadius: '4px'
                          }}>
                            {result.score}/100
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Right Column: The Real-time Terminal Log & Scorecards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Card 4: Agent Terminal (Logs) */}
          <div style={{ backgroundColor: '#000000', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', height: '340px', overflow: 'hidden' }}>
            {/* Terminal Top bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #333333', backgroundColor: '#111111' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                <span style={{ color: '#a1a1aa', fontSize: '11px', fontFamily: 'monospace', fontWeight: '600', marginLeft: '8px' }}>agent@silicon-patterns-screener:~</span>
              </div>
              <span style={{ fontSize: '10px', color: '#a1a1aa', fontFamily: 'monospace' }}>REACT ENGINE ACTIVE</span>
            </div>

            {/* Terminal Body */}
            <div style={{ flex: 1, padding: '14px 18px', overflowY: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '12px', lineHeight: '1.6', color: '#ededed', backgroundColor: '#000000' }}>
              {agentLogs.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', textAlign: 'center', paddingTop: '100px' }}>
                  &gt; Launch the agent to monitor live reasoning, decision planning, and local tool execution logs in this terminal.
                </div>
              ) : (
                agentLogs.map((log, index) => {
                  let color = '#f3f4f6';
                  let fontWeight = 'normal';

                  if (log.type === 'start') { color = '#3b82f6'; fontWeight = 'bold'; }
                  else if (log.type === 'thought') { color = '#c084fc'; }
                  else if (log.type === 'tool') { color = '#f59e0b'; }
                  else if (log.type === 'observation') { color = '#10b981'; }
                  else if (log.type === 'warning') { color = '#f59e0b'; }
                  else if (log.type === 'error') { color = '#ef4444'; fontWeight = 'bold'; }
                  else if (log.type === 'final') { color = '#10b981'; fontWeight = 'bold'; }
                  else if (log.type === 'system') { color = 'var(--text-secondary)'; }

                  return (
                    <div key={index} style={{ color, fontWeight, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: '8px' }}>
                      {log.text}
                    </div>
                  );
                })
              )}
              <div ref={consoleEndRef} />
            </div>
          </div>

          {/* Card 5: Screening Results & Scorecards */}
          <div style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 16px', color: 'var(--text-primary)' }}>📊 Screening Results</h2>

            {Object.keys(agentResults).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
                No evaluation records generated yet. Runs will appear here dynamically.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {masterLeads.map((candidate, idx) => {
                  const candUrl = candidate.linkedinUrl || candidate.url || `candidate-${idx}`;
                  const result = agentResults[candUrl];
                  if (!result) return null;

                  return (
                    <div key={idx} style={{ padding: '12px 16px', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ minWidth: 0, flex: 1, marginRight: '16px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                          {candidate.firstName} {candidate.lastName}
                        </span>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {result.reasoning.substring(0, 100)}...
                        </p>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                        <span style={{
                          fontSize: '12px', fontWeight: '600',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-color)',
                          padding: '4px 8px', borderRadius: '5px'
                        }}>
                          {result.score}
                        </span>
                        <button 
                          onClick={() => setViewingReasoning({ candidate, result })}
                          style={{
                            padding: '6px 12px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                            borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', color: 'var(--text-primary)'
                          }}
                        >
                          View Reasoning
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Modal for detailed agent reasoning */}
      {viewingReasoning && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface)', borderRadius: '12px', maxWidth: '680px', width: '100%',
            maxHeight: '80vh', overflowY: 'auto', padding: '28px', border: '1px solid var(--border-color)',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  Agent Evaluation: {viewingReasoning.candidate.firstName} {viewingReasoning.candidate.lastName}
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Model: {selectedModel}
                </p>
              </div>
              <span style={{
                fontSize: '14px', fontWeight: '600',
                backgroundColor: 'var(--bg-main)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                padding: '6px 12px', borderRadius: '6px'
              }}>{viewingReasoning.result.score}/100</span>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Autonomous Reasoning</h4>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', whiteSpace: 'pre-wrap', backgroundColor: 'var(--bg-main)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                {viewingReasoning.result.reasoning}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button 
                  onClick={() => setViewingReasoning(null)} 
                  style={{
                    padding: '8px 20px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)',
                    borderRadius: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer'
                  }}
                >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Embedded CSS for pulsing animation in logs */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

    </div>
  );
}
