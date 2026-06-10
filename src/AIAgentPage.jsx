import React, { useState, useEffect, useRef } from 'react';
import { runCandidateAgent } from './agent.js';

export default function AIAgentPage({ masterLeads, setMasterLeads }) {
  // Config state
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile');
  
  // Job Description / Screening Requirement
  const [jobDescription, setJobDescription] = useState(
    "Senior ASIC Verification Engineer.\nRequirements:\n- 5+ years of active design verification experience\n- Strong proficiency in UVM and SystemVerilog architectures\n- Experience with PCIe protocol (Gen4/Gen5) validation\n- Excellent debug and testbench layout skills"
  );

  // Selected candidates to run agent on
  const [selectedCandidateIds, setSelectedCandidateIds] = useState([]);

  // Running states
  const [isRunning, setIsRunning] = useState(false);
  const [currentRunningIndex, setCurrentRunningIndex] = useState(null);
  const [agentLogs, setAgentLogs] = useState([]); // Array of log messages for current run
  const [agentResults, setAgentResults] = useState({}); // candidateUrl -> { score, reasoning, logs }
  const [viewingReasoning, setViewingReasoning] = useState(null); // Candidate object being viewed

  const consoleEndRef = useRef(null);

  // Load API Key & saved results from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('siliconPatternsGroqApiKey') || import.meta.env.VITE_GROQ_API_TOKEN || '';
    if (savedKey) setApiKey(savedKey);

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

  // Handle API Key input save
  const handleSaveConfig = () => {
    localStorage.setItem('siliconPatternsGroqApiKey', apiKey);
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
    if (selectedCandidateIds.length === masterLeads.length) {
      setSelectedCandidateIds([]);
    } else {
      setSelectedCandidateIds(masterLeads.map((_, idx) => idx));
    }
  };

  // Run the agent on selected candidates
  const handleRunAgent = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      alert("Please provide a valid Groq API Key to proceed.");
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
          apiKey,
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
          <h1 style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: '700', color: '#18181b', letterSpacing: '-0.02em' }}>
            Autonomous AI Agent Screener
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#71717a' }}>
            Powered by Groq. Watch a true ReAct agent plan, call tools, analyze files, and grade candidates live.
          </p>
        </div>
        
        {Object.keys(agentResults).length > 0 && (
          <button 
            onClick={handleCommitToDatabase} 
            style={{ 
              padding: '10px 20px', 
              backgroundColor: '#16a34a', 
              color: '#fff', 
              border: 'none', 
              borderRadius: '6px', 
              cursor: 'pointer', 
              fontSize: '13px', 
              fontWeight: '700',
              boxShadow: '0 4px 12px rgba(22, 163, 74, 0.2)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#15803d'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#16a34a'}
          >
            💾 Commit Scores to Database
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Column: Config, Target requirements, and Candidate Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Card 1: Configuration */}
          <div style={{ backgroundColor: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 16px', color: '#18181b' }}>🔑 Groq API & Model Setup</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#52525b', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Groq API Key (Stored Locally)
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="gsk_..."
                    style={{
                      flex: 1, padding: '9px 12px', borderRadius: '6px', border: '1px solid #d4d4d8',
                      fontSize: '13px', color: '#18181b', outline: 'none'
                    }}
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowKey(!showKey)}
                    style={{
                      padding: '0 12px', backgroundColor: '#f4f4f5', border: '1px solid #e4e4e7',
                      borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '500'
                    }}
                  >
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#52525b', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Reasoning Engine Model
                  </label>
                  <select 
                    value={selectedModel} 
                    onChange={e => setSelectedModel(e.target.value)} 
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #d4d4d8',
                      fontSize: '13px', color: '#18181b', outline: 'none', backgroundColor: '#fff'
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
                    padding: '10px 16px', backgroundColor: '#18181b', color: '#fff', border: 'none',
                    borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600'
                  }}
                >
                  Save Config
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Screening Target */}
          <div style={{ backgroundColor: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: '#18181b' }}>🎯 Screening Requirements</h2>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={() => loadTemplate('ASIC DV')} style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid #e4e4e7', borderRadius: '4px', backgroundColor: '#fafafa', cursor: 'pointer' }}>DV</button>
                <button type="button" onClick={() => loadTemplate('DFT')} style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid #e4e4e7', borderRadius: '4px', backgroundColor: '#fafafa', cursor: 'pointer' }}>DFT</button>
                <button type="button" onClick={() => loadTemplate('Physical Design')} style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid #e4e4e7', borderRadius: '4px', backgroundColor: '#fafafa', cursor: 'pointer' }}>PD</button>
              </div>
            </div>
            
            <textarea
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
              placeholder="Describe the candidate requirements, skills, and target experience..."
              rows={6}
              style={{
                width: '100%', padding: '12px', boxSizing: 'border-box', borderRadius: '6px',
                border: '1px solid #d4d4d8', fontSize: '13px', color: '#18181b', lineHeight: '1.5',
                outline: 'none', fontFamily: 'monospace', resize: 'vertical'
              }}
            />
          </div>

          {/* Card 3: Candidate Pool Selection */}
          <div style={{ backgroundColor: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: '#18181b' }}>👥 Candidate Pool</h2>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#71717a' }}>Select targets for autonomous evaluation</p>
              </div>
              {masterLeads.length > 0 && (
                <button 
                  type="button" 
                  onClick={handleSelectAll}
                  style={{
                    padding: '4px 10px', fontSize: '11px', border: '1px solid #e4e4e7',
                    borderRadius: '4px', backgroundColor: '#f4f4f5', cursor: 'pointer', fontWeight: '600'
                  }}
                >
                  {selectedCandidateIds.length === masterLeads.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            {masterLeads.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#71717a', fontSize: '13px' }}>
                No candidates available. Please run a scrape search first!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxH: '260px', overflowY: 'auto', paddingRight: '4px' }}>
                {masterLeads.map((candidate, idx) => {
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
                        padding: '10px 14px', borderRadius: '8px', border: isCurrent ? '1.5px solid #2563eb' : '1px solid #e4e4e7',
                        backgroundColor: isCurrent ? '#eff6ff' : isSelected ? '#fafafa' : '#fff',
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
                          style={{ accentColor: '#18181b', cursor: isRunning ? 'not-allowed' : 'pointer' }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: '#18181b' }}>
                            {candidate.firstName || 'Unknown'} {candidate.lastName || ''}
                          </span>
                          <p style={{ margin: 0, fontSize: '11px', color: '#71717a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {candidate.currentTitle || candidate.jobTitle || candidate.headline}
                          </p>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        {isCurrent && <span style={{ fontSize: '10px', color: '#2563eb', fontWeight: '700', animation: 'pulse 1.5s infinite' }}>🤖 THINKING</span>}
                        {result && (
                          <span style={{
                            fontSize: '11px', fontWeight: '800',
                            backgroundColor: result.score >= 70 ? '#dcfce7' : result.score >= 40 ? '#fef9c3' : '#f4f4f5',
                            color: result.score >= 70 ? '#16a34a' : result.score >= 40 ? '#ca8a04' : '#52525b',
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

            <button
              onClick={handleRunAgent}
              disabled={isRunning || selectedCandidateIds.length === 0}
              style={{
                width: '100%', marginTop: '16px', padding: '12px',
                backgroundColor: isRunning ? '#a1a1aa' : selectedCandidateIds.length === 0 ? '#e4e4e7' : '#18181b',
                color: selectedCandidateIds.length === 0 && !isRunning ? '#a1a1aa' : '#fff',
                border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600',
                cursor: isRunning || selectedCandidateIds.length === 0 ? 'not-allowed' : 'pointer',
                boxShadow: isRunning ? 'none' : '0 4px 10px rgba(0,0,0,0.05)',
                transition: 'background-color 0.2s'
              }}
            >
              {isRunning ? '🤖 Agent Executing Loop...' : `Launch Agent on ${selectedCandidateIds.length} Candidate(s)`}
            </button>
          </div>

        </div>

        {/* Right Column: The Real-time Terminal Log & Scorecards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Card 4: Agent Terminal (Logs) */}
          <div style={{ backgroundColor: '#18181b', borderRadius: '12px', border: '1px solid #2e303a', display: 'flex', flexDirection: 'column', height: '340px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            {/* Terminal Top bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #2e303a', backgroundColor: '#1f2028' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                <span style={{ color: '#9ca3af', fontSize: '11px', fontFamily: 'monospace', fontWeight: '600', marginLeft: '8px' }}>agent@silicon-patterns-screener:~</span>
              </div>
              <span style={{ fontSize: '10px', color: '#4b5563', fontFamily: 'monospace' }}>REACT ENGINE ACTIVE</span>
            </div>

            {/* Terminal Body */}
            <div style={{ flex: 1, padding: '14px 18px', overflowY: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '12px', lineHeight: '1.6', color: '#f3f4f6', backgroundColor: '#0d0e12' }}>
              {agentLogs.length === 0 ? (
                <div style={{ color: '#4b5563', textAlign: 'center', paddingTop: '100px' }}>
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
                  else if (log.type === 'system') { color = '#4b5563'; }

                  return (
                    <div key={index} style={{ color, fontWeight, whiteSpace: 'pre-wrap', marginBottom: '8px' }}>
                      {log.text}
                    </div>
                  );
                })
              )}
              <div ref={consoleEndRef} />
            </div>
          </div>

          {/* Card 5: Screening Results & Scorecards */}
          <div style={{ backgroundColor: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 16px', color: '#18181b' }}>📊 Screening Results</h2>

            {Object.keys(agentResults).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#71717a', fontSize: '13px' }}>
                No evaluation records generated yet. Runs will appear here dynamically.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {masterLeads.map((candidate, idx) => {
                  const candUrl = candidate.linkedinUrl || candidate.url || `candidate-${idx}`;
                  const result = agentResults[candUrl];
                  if (!result) return null;

                  return (
                    <div key={idx} style={{ padding: '12px 16px', border: '1px solid #e4e4e7', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ minWidth: 0, flex: 1, marginRight: '16px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#18181b' }}>
                          {candidate.firstName} {candidate.lastName}
                        </span>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#71717a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {result.reasoning.substring(0, 100)}...
                        </p>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                        <span style={{
                          fontSize: '12px', fontWeight: '800',
                          backgroundColor: result.score >= 70 ? '#dcfce7' : result.score >= 40 ? '#fef9c3' : '#f4f4f5',
                          color: result.score >= 70 ? '#16a34a' : result.score >= 40 ? '#ca8a04' : '#52525b',
                          padding: '4px 8px', borderRadius: '5px'
                        }}>
                          {result.score}
                        </span>
                        <button 
                          onClick={() => setViewingReasoning({ candidate, result })}
                          style={{
                            padding: '6px 12px', backgroundColor: '#f4f4f5', border: '1px solid #e4e4e7',
                            borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', color: '#18181b'
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
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#fff', borderRadius: '12px', maxWidth: '680px', width: '100%',
            maxHeight: '80vh', overflowY: 'auto', padding: '28px', border: '1px solid #e4e4e7',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e4e4e7', paddingBottom: '16px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#18181b' }}>
                  Agent Evaluation: {viewingReasoning.candidate.firstName} {viewingReasoning.candidate.lastName}
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#71717a' }}>
                  Model: {selectedModel}
                </p>
              </div>
              <span style={{
                fontSize: '14px', fontWeight: '800',
                backgroundColor: viewingReasoning.result.score >= 70 ? '#dcfce7' : viewingReasoning.result.score >= 40 ? '#fef9c3' : '#f4f4f5',
                color: viewingReasoning.result.score >= 70 ? '#16a34a' : viewingReasoning.result.score >= 40 ? '#ca8a04' : '#52525b',
                padding: '6px 12px', borderRadius: '6px'
              }}>{viewingReasoning.result.score}/100</span>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: '600', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Autonomous Reasoning</h4>
              <div style={{ fontSize: '14px', color: '#3f3f46', lineHeight: '1.6', whiteSpace: 'pre-wrap', backgroundColor: '#fafafa', padding: '16px', borderRadius: '8px', border: '1px solid #e4e4e7' }}>
                {viewingReasoning.result.reasoning}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setViewingReasoning(null)} 
                style={{
                  padding: '8px 20px', backgroundColor: '#18181b', color: '#fff', border: 'none',
                  borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
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
