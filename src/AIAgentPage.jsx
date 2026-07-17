import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { runCandidateAgent } from './agent.js';
import { ASIC_SKILLS, ASIC_SKILLS_CATEGORIZED } from './skills.js';
import { extractSkillsList, matchSkillFlexible, computeTotalExperienceYears, safeExtractText } from './CandidatesPage.jsx';
import { getFilteredLeadsForRecruiter } from './recruiterFilter.js';
import { isCandidateOpenToWork } from './App.jsx';
import { useAuth } from './AuthContext';

export default function AIAgentPage({ masterLeads, setMasterLeads }) {
  const { currentUser } = useAuth();
  const recruiterLeads = useMemo(() => getFilteredLeadsForRecruiter(masterLeads, currentUser), [masterLeads, currentUser]);
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('setup');
  // Config state
  const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile');
  
  // Job Description / Screening Requirement
  const [jobDescription, setJobDescription] = useState(
    "Senior ASIC Verification Engineer.\nRequirements:\n- 5+ years of active design verification experience\n- Strong proficiency in UVM and SystemVerilog architectures\n- Experience with PCIe protocol (Gen4/Gen5) validation\n- Excellent debug and testbench layout skills"
  );

  // Target Skills state
  const [targetSkills, setTargetSkills] = useState([]);
  const [skillFilterMode, setSkillFilterMode] = useState('all'); // 'all' = must have every skill, 'any' = at least one
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Track manually selected candidate URLs
  const [selectedUrls, setSelectedUrls] = useState(new Set());
  const [candidateSearchText, setCandidateSearchText] = useState('');
  const [filterOpenToWork, setFilterOpenToWork] = useState(false);
  const [filterLocation, setFilterLocation] = useState('');
  const [filterExpMin, setFilterExpMin] = useState('');
  const [filterExpMax, setFilterExpMax] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // newest | oldest | name_asc | name_desc
  const stopRequested = useRef(false);

  // Distinct first-token locations across the pool, for the location dropdown.
  const uniqueLocations = useMemo(() => {
    const locs = new Set();
    recruiterLeads.forEach(p => {
      const loc = safeExtractText(p.location).split(',')[0].trim();
      if (loc && loc !== 'N/A') locs.add(loc);
    });
    return [...locs].sort();
  }, [recruiterLeads]);

  // The actual targets to be evaluated when running
  const evaluationTargets = useMemo(() => {
    return recruiterLeads
      .map((candidate, idx) => ({ candidate, idx: masterLeads.indexOf(candidate) }))
      .filter(item => {
        const url = item.candidate.linkedinUrl || item.candidate.url || `candidate-${item.idx}`;
        return selectedUrls.has(url);
      });
  }, [masterLeads, recruiterLeads, selectedUrls]);

  // Compute the list of candidates matching the filters to show in the selector UI
  const filteredSelectionList = useMemo(() => {
    let results = [...recruiterLeads];
    
    // 1. Filter by targetSkills first (if targetSkills are specified)
    if (targetSkills.length > 0) {
      results = results.filter(p => {
        const skillsStr = extractSkillsList(p);
        const titleStr = p.currentTitle || p.jobTitle || p.headline || '';
        const aboutStr = p.about || p.summary || '';
        const fullText = `${skillsStr} ${titleStr} ${aboutStr}`;
        return skillFilterMode === 'any'
          ? targetSkills.some(skill => matchSkillFlexible(fullText, skill))
          : targetSkills.every(skill => matchSkillFlexible(fullText, skill));
      });
    }

    // 2. Filter by candidateSearchText (name or title)
    if (candidateSearchText.trim()) {
      const q = candidateSearchText.trim().toLowerCase();
      results = results.filter(p => {
        const name = `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase();
        const title = (p.currentTitle || p.jobTitle || p.headline || '').toLowerCase();
        return name.includes(q) || title.includes(q);
      });
    }

    // 3. Filter by Open to Work status
    if (filterOpenToWork) {
      results = results.filter(p => isCandidateOpenToWork(p));
    }

    // 4. Filter by location (first-token match, same as Talent Pool)
    if (filterLocation) {
      results = results.filter(p => safeExtractText(p.location).split(',')[0].trim() === filterLocation);
    }

    // 5. Filter by computed experience range (summed from listed roles).
    // Candidates whose experience can't be computed are excluded only while
    // this filter is active, since "unknown" can't be confirmed in range.
    if (filterExpMin !== '' || filterExpMax !== '') {
      const min = filterExpMin !== '' ? parseFloat(filterExpMin) : null;
      const max = filterExpMax !== '' ? parseFloat(filterExpMax) : null;
      results = results.filter(p => {
        const years = parseFloat(computeTotalExperienceYears(p.positions || p.experience || []));
        if (!Number.isFinite(years)) return false;
        if (min != null && years < min) return false;
        if (max != null && years > max) return false;
        return true;
      });
    }

    // 6. Sort. "newest"/"oldest" use createdAt (scrape time); fall back to
    // the master-list order when a candidate has no timestamp.
    const getCreatedAt = (p) => p.createdAt ? new Date(p.createdAt).getTime() : 0;
    const nameOf = (p) => `${p.firstName || ''} ${p.lastName || ''}`.trim().toLowerCase();
    const sorted = [...results];
    switch (sortBy) {
      case 'newest': sorted.sort((a, b) => getCreatedAt(b) - getCreatedAt(a)); break;
      case 'oldest': sorted.sort((a, b) => getCreatedAt(a) - getCreatedAt(b)); break;
      case 'name_asc': sorted.sort((a, b) => nameOf(a).localeCompare(nameOf(b))); break;
      case 'name_desc': sorted.sort((a, b) => nameOf(b).localeCompare(nameOf(a))); break;
      default: break;
    }
    return sorted;
  }, [masterLeads, targetSkills, skillFilterMode, candidateSearchText, filterOpenToWork, filterLocation, filterExpMin, filterExpMax, sortBy]);

  const toggleCandidateSelection = (url) => {
    setSelectedUrls(prev => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  };

  const selectAllTargets = (visibleCandidates) => {
    setSelectedUrls(prev => {
      const next = new Set(prev);
      visibleCandidates.forEach((p) => {
        const url = p.linkedinUrl || p.url || `candidate-${masterLeads.indexOf(p)}`;
        next.add(url);
      });
      return next;
    });
  };

  // Running states
  const [isRunning, setIsRunning] = useState(false);
  const [currentRunningIndex, setCurrentRunningIndex] = useState(null);
  const [agentLogs, setAgentLogs] = useState([]); // Array of log messages for current run
  const [agentResults, setAgentResults] = useState({}); // candidateUrl -> { score, reasoning, logs }
  const [viewingReasoning, setViewingReasoning] = useState(null); // Candidate object being viewed



  // Pagination for results
  const RESULTS_PAGE_SIZE = 10;
  const [resultsPage, setResultsPage] = useState(1);

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



  // Run the agent on selected candidates
  const handleRunAgent = async (e) => {
    e.preventDefault();
    const currentApiKey = localStorage.getItem('siliconPatternsGroqApiKey') || import.meta.env.VITE_GROQ_API_TOKEN || '';
    if (!currentApiKey.trim()) {
      alert("Please provide a valid Groq API Key in Settings to proceed.");
      return;
    }
    if (evaluationTargets.length === 0) {
      alert("Please select at least one candidate to evaluate in the list below.");
      return;
    }

    stopRequested.current = false;
    setIsRunning(true);
    setViewMode('results');
    setAgentLogs([]);
    const newResults = { ...agentResults };

    // Loop through each targeted candidate sequentially
    for (let i = 0; i < evaluationTargets.length; i++) {
      if (stopRequested.current) {
        setAgentLogs(prev => [
          ...prev,
          { type: 'system', text: `==================================================` },
          { type: 'system', text: `AI AGENT SCREENING STOPPED BY USER MIDWAY!` },
          { type: 'system', text: `==================================================` }
        ]);
        break;
      }

      const idx = evaluationTargets[i].idx;
      const candidate = evaluationTargets[i].candidate;
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
              logText = `[Thought] ${stepInfo.message}`;
              logType = 'thought';
            } else if (stepInfo.type === 'tool_call') {
              logText = `[Action] Calling ${stepInfo.message}`;
              logType = 'tool';
            } else if (stepInfo.type === 'observation') {
              logText = `[Observation] ${stepInfo.message}`;
              logType = 'observation';
            } else if (stepInfo.type === 'warning') {
              logText = `[Warning] ${stepInfo.message}`;
              logType = 'warning';
            } else if (stepInfo.type === 'error') {
              logText = `[Error] ${stepInfo.message}`;
              logType = 'error';
            } else if (stepInfo.type === 'final') {
              logText = `[Final Recommendation] Compiled! Score: ${stepInfo.result.score}/100`;
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

        // Auto-commit to master database in real-time
        setMasterLeads(prevLeads => {
          const updated = [...prevLeads];
          if (updated[idx]) {
            updated[idx] = {
              ...updated[idx],
              agentScore: result.score,
              agentReasoning: result.reasoning,
              matchScore: result.score
            };
          }
          return updated;
        });

      } catch (err) {
        console.error("Agent failed for candidate", candidate, err);
        const errorLog = { type: 'error', text: `[Error] Agent run failed: ${err.message}` };
        setAgentLogs(prev => [...prev, errorLog]);

        newResults[candUrl] = {
          score: 0,
          reasoning: `Screening failed: ${err.message}`,
          logs: [errorLog]
        };
        setAgentResults({ ...newResults });

        // Auto-commit failed status in real-time
        setMasterLeads(prevLeads => {
          const updated = [...prevLeads];
          if (updated[idx]) {
            updated[idx] = {
              ...updated[idx],
              agentScore: 0,
              agentReasoning: `Screening failed: ${err.message}`,
              matchScore: 0
            };
          }
          return updated;
        });
      }
    }

    setCurrentRunningIndex(null);
    setIsRunning(false);
    setAgentLogs(prev => [
      ...prev,
      { type: 'system', text: `==================================================` },
      { type: 'system', text: `AI AGENT SCREENING COMPLETED FOR ALL TARGETS!` },
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
    try {
      localStorage.setItem('siliconPatternsMasterDatabase', JSON.stringify(updatedLeads));
      alert('AI Agent scores and reasonings successfully integrated into your main Candidate Database!');
    } catch (err) {
      console.error("Local storage save failed. Data may be too large:", err);
      alert('Scores integrated, but browser local storage is full. Candidate data could not be saved locally. Please connect a Supabase database to store more candidates, or clear some data.');
    }
  };

  const downloadLeaderboardCSV = () => {
    if (currentUser?.role !== 'admin') {
      alert('Only administrators can export the leaderboard to CSV.');
      return;
    }
    const evaluatedCandidates = masterLeads.map((candidate, idx) => {
      const candUrl = candidate.linkedinUrl || candidate.url || `candidate-${idx}`;
      return { candidate, result: agentResults[candUrl] };
    }).filter(item => item.result).sort((a, b) => b.result.score - a.result.score);

    if (evaluatedCandidates.length === 0) return;

    const headers = ['Evaluation Score', 'First Name', 'Last Name', 'Current Title', 'LinkedIn URL', 'AI Reasoning'];
    
    const cleanExtractUrl = (field) => {
      if (!field) return '';
      if (typeof field === 'string') {
        let u = field.trim();
        if (u.startsWith('{') && u.endsWith('}')) {
          try {
            const parsed = JSON.parse(u);
            const urlVal = parsed.url || parsed.linkedinUrl || parsed.linkedin_url || Object.values(parsed).find(v => typeof v === 'string' && (v.startsWith('http') || v.includes('linkedin.com')));
            if (urlVal) return urlVal.trim();
          } catch (e) {}
        }
        const match = u.match(/(https?:\/\/[^\s,"]+)/);
        if (match) return match[1];
        return u;
      }
      if (typeof field === 'object') {
        const urlVal = field.url || field.linkedinUrl || field.linkedin_url || Object.values(field).find(v => typeof v === 'string' && (v.startsWith('http') || v.includes('linkedin.com')));
        if (urlVal) return cleanExtractUrl(urlVal);
      }
      if (Array.isArray(field)) {
        for (const item of field) {
          const res = cleanExtractUrl(item);
          if (res) return res;
        }
      }
      return '';
    };

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      // Replace newlines and carriage returns with spaces to keep rows on a single line in CSV
      const s = String(str).replace(/[\r\n]+/g, ' ').trim();
      return '"' + s.replace(/"/g, '""') + '"';
    };

    const rows = evaluatedCandidates.map(({ candidate: p, result }) => {
      const title = p.currentTitle || p.jobTitle || p.headline || '';
      const url = cleanExtractUrl(p.linkedinUrl || p.url || '');
      const score = result.score;
      const reasoning = result.reasoning;
      return [score, p.firstName || '', p.lastName || '', title, url, reasoning].map(escapeCsv).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `AI_Evaluated_Leaderboard_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
        </div>
        
        {Object.keys(agentResults).length > 0 && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {currentUser?.role === 'admin' && (
              <button 
                onClick={downloadLeaderboardCSV} 
                title="Export Leaderboard CSV"
                style={{ 
                  padding: '10px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', 
                  borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              </button>
            )}
            <button 
              onClick={handleCommitToDatabase} 
              title="Commit Scores to Database"
              style={{ 
                padding: '10px', 
                backgroundColor: 'var(--accent)', 
                color: 'var(--accent-fg)', 
                border: 'none', 
                borderRadius: '6px', 
                cursor: 'pointer', 
                transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
            </button>
          </div>
        )}
      </div>

      {viewMode === 'setup' ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '40px' }}>
          <div style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Unified Agent Configuration Card */}
            <div style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>Agent Setup</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Configure the model, requirements, and target skills</p>
                </div>
                <button 
                  onClick={handleSaveConfig}
                  title="Save Preset"
                  style={{
                    padding: '8px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)',
                    borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px'
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                </button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>
                    Model
                  </label>
                  <select 
                    value={selectedModel} 
                    onChange={e => setSelectedModel(e.target.value)} 
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)',
                      fontSize: '14px', color: 'var(--text-primary)', outline: 'none', backgroundColor: 'var(--bg-surface)'
                    }}
                  >
                    <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Rec)</option>
                    <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (Fast)</option>
                    <option value="gemma2-9b-it">gemma2-9b-it</option>
                    <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
                  </select>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Role Requirements Prompt
                    </label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button type="button" onClick={() => loadTemplate('ASIC DV')} style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '4px', backgroundColor: 'var(--bg-surface)', cursor: 'pointer' }}>Load DV</button>
                      <button type="button" onClick={() => loadTemplate('DFT')} style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '4px', backgroundColor: 'var(--bg-surface)', cursor: 'pointer' }}>Load DFT</button>
                      <button type="button" onClick={() => loadTemplate('Physical Design')} style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '4px', backgroundColor: 'var(--bg-surface)', cursor: 'pointer' }}>Load PD</button>
                    </div>
                  </div>
                  <textarea
                    value={jobDescription}
                    onChange={e => setJobDescription(e.target.value)}
                    placeholder="Describe the candidate requirements..."
                    rows={6}
                    style={{
                      width: '100%', padding: '12px', boxSizing: 'border-box', borderRadius: '6px',
                      border: '1px solid var(--border-color)', fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.5',
                      outline: 'none', fontFamily: 'monospace', resize: 'vertical', backgroundColor: 'var(--bg-surface)'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>
                    Filter by Skills
                  </label>
                  <p style={{ margin: '0 0 8px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Narrows the candidate list below. This only filters who's shown — it does not select anyone.
                  </p>
                  {targetSkills.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Match</span>
                      <div style={{ display: 'inline-flex', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                        {['any', 'all'].map(mode => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setSkillFilterMode(mode)}
                            style={{
                              padding: '4px 12px', fontSize: '12px', fontWeight: '600', border: 'none', cursor: 'pointer',
                              backgroundColor: skillFilterMode === mode ? 'var(--accent)' : 'transparent',
                              color: skillFilterMode === mode ? 'var(--accent-fg)' : 'var(--text-secondary)',
                            }}
                          >{mode === 'any' ? 'Any' : 'All'}</button>
                        ))}
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {skillFilterMode === 'any' ? 'has at least one selected skill' : 'has every selected skill'}
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                    {targetSkills.map(skill => (
                      <span key={skill} style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 10px', borderRadius: '6px', fontSize: '13px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                        {skill}
                        <button onClick={() => setTargetSkills(prev => prev.filter(s => s !== skill))} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', marginLeft: '8px', padding: 0, fontSize: '14px', lineHeight: '1' }}>×</button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                    <select
                      value={selectedCategory}
                      onChange={e => setSelectedCategory(e.target.value)}
                      style={{
                        width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)',
                        fontSize: '13px', color: 'var(--text-primary)', outline: 'none', backgroundColor: 'var(--bg-surface)'
                      }}
                    >
                      <option value="All">All Categories</option>
                      {Object.keys(ASIC_SKILLS_CATEGORIZED).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                    <select
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val && !targetSkills.includes(val)) {
                          setTargetSkills(prev => [...prev, val]);
                        }
                      }}
                      style={{
                        width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)',
                        fontSize: '13px', color: 'var(--text-primary)', outline: 'none', backgroundColor: 'var(--bg-surface)'
                      }}
                    >
                      <option value="" disabled>Add a required skill...</option>
                      {(selectedCategory === 'All' ? ASIC_SKILLS : ASIC_SKILLS_CATEGORIZED[selectedCategory]).filter(s => !targetSkills.includes(s)).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>


                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Choose Candidates · <span style={{ color: 'var(--text-primary)' }}>{filteredSelectionList.length} shown</span> · <span style={{ color: 'var(--accent)' }}>{selectedUrls.size} selected</span>
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => selectAllTargets(filteredSelectionList)}
                        disabled={filteredSelectionList.length === 0}
                        style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: '4px', backgroundColor: 'transparent', cursor: filteredSelectionList.length === 0 ? 'not-allowed' : 'pointer', opacity: filteredSelectionList.length === 0 ? 0.4 : 1 }}
                      >
                        Select {filteredSelectionList.length} shown
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedUrls(new Set())}
                        disabled={selectedUrls.size === 0}
                        style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '4px', backgroundColor: 'var(--bg-surface)', cursor: selectedUrls.size === 0 ? 'not-allowed' : 'pointer', opacity: selectedUrls.size === 0 ? 0.4 : 1 }}
                      >
                        Clear selection
                      </button>
                    </div>
                  </div>
                  <input 
                    type="text" 
                    placeholder="Search candidate list by name or title..."
                    value={candidateSearchText}
                    onChange={e => setCandidateSearchText(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)',
                      fontSize: '13px', color: 'var(--text-primary)', backgroundColor: 'var(--bg-surface)', outline: 'none',
                      marginBottom: '10px', boxSizing: 'border-box'
                    }}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        id="agentFilterOpenToWork"
                        checked={filterOpenToWork}
                        onChange={e => setFilterOpenToWork(e.target.checked)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                      />
                      <label htmlFor="agentFilterOpenToWork" style={{ fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: '500' }}>
                        Only show candidates flagged as "Open to Work"
                      </label>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Sort:</span>
                      <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value)}
                        style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--text-primary)', backgroundColor: 'var(--bg-surface)', outline: 'none', cursor: 'pointer' }}
                      >
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                        <option value="name_asc">Name (A–Z)</option>
                        <option value="name_desc">Name (Z–A)</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Location:</span>
                      <select
                        value={filterLocation}
                        onChange={e => setFilterLocation(e.target.value)}
                        style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--text-primary)', backgroundColor: 'var(--bg-surface)', outline: 'none', cursor: 'pointer', maxWidth: '160px' }}
                      >
                        <option value="">All locations</option>
                        {uniqueLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Exp:</span>
                      <input
                        type="number" min="0" max="50" placeholder="Min"
                        value={filterExpMin}
                        onChange={e => setFilterExpMin(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))}
                        style={{ width: '52px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--text-primary)', backgroundColor: 'var(--bg-surface)', outline: 'none' }}
                      />
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>–</span>
                      <input
                        type="number" min="0" max="50" placeholder="Max"
                        value={filterExpMax}
                        onChange={e => setFilterExpMax(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))}
                        style={{ width: '52px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--text-primary)', backgroundColor: 'var(--bg-surface)', outline: 'none' }}
                      />
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>yrs</span>
                    </div>
                    {(filterLocation || filterExpMin !== '' || filterExpMax !== '' || filterOpenToWork || candidateSearchText || targetSkills.length > 0) && (
                      <button
                        type="button"
                        onClick={() => { setFilterLocation(''); setFilterExpMin(''); setFilterExpMax(''); setFilterOpenToWork(false); setCandidateSearchText(''); setTargetSkills([]); }}
                        style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid rgba(248, 113, 113, 0.3)', color: '#f87171', borderRadius: '4px', backgroundColor: 'rgba(220, 38, 38, 0.1)', cursor: 'pointer' }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>

                  <div style={{
                    maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border-color)',
                    borderRadius: '6px', backgroundColor: 'var(--bg-surface)', padding: '4px'
                  }}>
                    {filteredSelectionList.length === 0 ? (
                      <p style={{ margin: '16px 0', fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                        No matching candidates found.
                      </p>
                    ) : (
                      filteredSelectionList.map(p => {
                        const url = p.linkedinUrl || p.url || `candidate-${masterLeads.indexOf(p)}`;
                        const isChecked = selectedUrls.has(url);
                        const name = `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Unknown Candidate';
                        const title = p.currentTitle || p.jobTitle || p.headline || 'No Title';
                        return (
                          <div 
                            key={url} 
                            onClick={() => toggleCandidateSelection(url)}
                            style={{ 
                              display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', 
                              borderRadius: '4px', cursor: 'pointer', backgroundColor: isChecked ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                              transition: 'background-color 0.15s', borderBottom: '1px solid var(--border-color)'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = isChecked ? 'rgba(0, 229, 255, 0.12)' : 'var(--bg-main)'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = isChecked ? 'rgba(0, 229, 255, 0.08)' : 'transparent'}
                          >
                            <input 
                              type="checkbox" 
                              checked={isChecked}
                              onChange={() => {}} // handled by parent onClick
                              style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{name}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{title}</div>
                            </div>
                            {p.agentScore !== undefined && (
                              <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(0, 229, 255, 0.1)' }}>
                                Score: {p.agentScore}
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div style={{ marginTop: '12px', paddingTop: '24px', borderTop: '1px solid var(--border-color)' }}>
                  <p style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                    {evaluationTargets.length === 0 
                      ? "Select at least one candidate above to score."
                      : <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{evaluationTargets.length} candidates selected for AI evaluation.</span>}
                  </p>

                  <button
                    onClick={handleRunAgent}
                    title="Launch Autonomous Evaluation"
                    disabled={isRunning || evaluationTargets.length === 0}
                    style={{
                      width: '100%', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      backgroundColor: isRunning ? 'var(--border-color)' : evaluationTargets.length === 0 ? 'var(--bg-surface)' : 'var(--accent)',
                      color: evaluationTargets.length === 0 && !isRunning ? 'var(--text-secondary)' : 'var(--accent-fg)',
                      border: evaluationTargets.length === 0 ? '1px solid var(--border-color)' : 'none', borderRadius: '8px',
                      cursor: isRunning || evaluationTargets.length === 0 ? 'not-allowed' : 'pointer',
                      transition: 'background-color 0.2s, transform 0.1s',
                      boxShadow: evaluationTargets.length > 0 && !isRunning ? '0 4px 14px 0 rgba(0,229,255,0.39)' : 'none',
                      fontSize: '15px', fontWeight: '700'
                    }}
                  >
                    {isRunning ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
                      </svg>
                    ) : (
                      <>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        Launch Autonomous Evaluation
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button 
              onClick={() => {
                if (!isRunning) {
                  setViewMode('setup');
                } else {
                  if (window.confirm("Agent is currently running. Going back will not stop it, but you will leave this view. Continue?")) {
                    setViewMode('setup');
                  }
                }
              }} 
              style={{ padding: '8px 16px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
              Back to Setup
            </button>

            {isRunning && (
              <button 
                onClick={() => {
                  if (window.confirm("Are you sure you want to stop the evaluation run? Candidates screened so far will be saved.")) {
                    stopRequested.current = true;
                  }
                }}
                style={{ 
                  padding: '8px 16px', 
                  backgroundColor: '#ef4444', 
                  color: '#ffffff', 
                  border: 'none', 
                  borderRadius: '6px', 
                  cursor: 'pointer', 
                  fontSize: '13px', 
                  fontWeight: '600', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  boxShadow: '0 4px 10px rgba(239, 68, 68, 0.3)'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                </svg>
                Stop Evaluation
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 1fr) minmax(350px, 450px)', gap: '24px', alignItems: 'start' }}>
            
            {/* Card 4: Agent Terminal (Logs) */}
            <div style={{ backgroundColor: '#000000', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', height: '540px', overflow: 'hidden' }}>
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

            {/* Card 5: Evaluation Leaderboard & Scorecards */}
            <div style={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '24px', height: '540px', display: 'flex', flexDirection: 'column' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 16px', color: 'var(--text-primary)' }}>Evaluation Leaderboard</h2>

              {Object.keys(agentResults).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: '13px', flex: 1 }}>
                  No evaluation records generated yet. Runs will appear here dynamically.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto' }}>
                  {(() => {
                    const resultEntries = recruiterLeads.map((candidate) => {
                      const candIdx = masterLeads.indexOf(candidate);
                      const candUrl = candidate.linkedinUrl || candidate.url || `candidate-${candIdx}`;
                      const result = agentResults[candUrl];
                      if (!result) return null;
                      return { candidate, idx: candIdx, result };
                    }).filter(Boolean).sort((a, b) => b.result.score - a.result.score);

                    const resultsTotalPages = Math.max(1, Math.ceil(resultEntries.length / RESULTS_PAGE_SIZE));
                    const safeResultsPage = Math.min(resultsPage, resultsTotalPages);
                    const paginatedResults = resultEntries.slice(
                      (safeResultsPage - 1) * RESULTS_PAGE_SIZE,
                      safeResultsPage * RESULTS_PAGE_SIZE
                    );

                    return (
                      <>
                        {paginatedResults.map(({ candidate, idx, result }) => (
                      <div key={idx} style={{ padding: '12px 16px', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ minWidth: 0, flex: 1, marginRight: '16px' }}>
                          <h4 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {candidate.firstName || 'Unknown'} {candidate.lastName || ''}
                          </h4>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button 
                              onClick={() => navigate('/candidates', { state: { highlightCandidateUrl: candidate.linkedinUrl || candidate.url || `candidate-${idx}` } })}
                              style={{ padding: 0, background: 'none', border: 'none', color: 'var(--accent)', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              View in Talent Pool
                            </button>
                            <button 
                              onClick={() => setViewingReasoning({ candidate, result })}
                              style={{ padding: 0, background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              Show Reasoning
                            </button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <span style={{ fontSize: '20px', fontWeight: '700', color: result.score >= 80 ? '#10b981' : result.score >= 60 ? '#f59e0b' : '#ef4444' }}>
                            {result.score}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>/ 100</span>
                        </div>
                      </div>
                    ))}

                        {/* Leaderboard Pagination */}
                        {resultEntries.length > RESULTS_PAGE_SIZE && (
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', paddingTop: '8px', borderTop: '1px solid var(--border-color)', marginTop: 'auto' }}>
                            <button
                              onClick={() => setResultsPage(p => Math.max(1, p - 1))}
                              disabled={safeResultsPage === 1}
                              style={{
                                padding: '4px 10px', border: '1px solid var(--border-color)', borderRadius: '4px',
                                backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)',
                                cursor: safeResultsPage === 1 ? 'not-allowed' : 'pointer', fontSize: '11px',
                                opacity: safeResultsPage === 1 ? 0.4 : 1,
                              }}
                            >← Prev</button>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              {safeResultsPage} / {resultsTotalPages} ({resultEntries.length} results)
                            </span>
                            <button
                              onClick={() => setResultsPage(p => Math.min(resultsTotalPages, p + 1))}
                              disabled={safeResultsPage === resultsTotalPages}
                              style={{
                                padding: '4px 10px', border: '1px solid var(--border-color)', borderRadius: '4px',
                                backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)',
                                cursor: safeResultsPage === resultsTotalPages ? 'not-allowed' : 'pointer', fontSize: '11px',
                                opacity: safeResultsPage === resultsTotalPages ? 0.4 : 1,
                              }}
                            >Next →</button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

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
