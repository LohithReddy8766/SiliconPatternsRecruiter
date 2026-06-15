import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import CandidatesPage from './CandidatesPage.jsx';
import AIAgentPage from './AIAgentPage.jsx';
import PipelinePage from './PipelinePage.jsx';
import { ASIC_SKILLS, ASIC_SKILLS_CATEGORIZED } from './skills.js';
import logo from './assets/logo.png';

const DEFAULT_APIFY_TOKEN = import.meta.env.VITE_APIFY_API_TOKEN || '';
const ACTOR_NAME = 'harvestapi~linkedin-profile-search';

function safeExtractText(field) {
  if (field === null || field === undefined) return 'N/A';
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) {
    return field.map(item => {
      if (typeof item === 'object') return Object.values(item).filter(v => typeof v === 'string').join(' ');
      return String(item);
    }).join(' | ');
  }
  if (typeof field === 'object') {
    return Object.values(field).filter(val => typeof val === 'string' || typeof val === 'number').join(' ');
  }
  return String(field);
}

function extractSkillsList(profile) {
  if (!profile.skills) return 'N/A';
  if (Array.isArray(profile.skills)) {
    return profile.skills.map(s => typeof s === 'string' ? s : (s.name || s.title || '')).filter(Boolean).join(', ');
  }
  return safeExtractText(profile.skills).replace(/[\r\n,"]/g, ' ');
}

function cleanUrl(url) {
  if (!url) return '';
  return url.split('?')[0].toLowerCase().trim();
}

export function isCandidateOpenToWork(profile) {
  if (profile.isOpenToWork === true) return true;
  const headline = safeExtractText(profile.headline).toLowerCase();
  const title = safeExtractText(profile.currentTitle || profile.jobTitle).toLowerCase();
  const about = safeExtractText(profile.about || profile.summary).toLowerCase();
  
  const keywords = ['open to work', '#opentowork', 'looking for new', 'actively looking', 'seeking new'];
  for (const kw of keywords) {
    if (headline.includes(kw) || title.includes(kw) || about.includes(kw)) return true;
  }
  if (headline.includes('looking for') || about.includes('looking for')) return true;
  return false;
}

function calculateCandidateScore(profile, selectedSkills, targetLocation, targetDesignations) {
  let score = 0;
  const headline = safeExtractText(profile.headline).toLowerCase();
  const currentTitle = safeExtractText(profile.currentTitle || profile.jobTitle).toLowerCase();
  const location = safeExtractText(profile.location).toLowerCase();
  const skillsList = extractSkillsList(profile).toLowerCase();
  const about = safeExtractText(profile.about || profile.summary).toLowerCase();

  if (selectedSkills.length > 0) {
    const pointsPerSkill = 50 / selectedSkills.length;
    selectedSkills.forEach(skill => {
      const sk = skill.toLowerCase();
      if (headline.includes(sk) || currentTitle.includes(sk) || skillsList.includes(sk) || about.includes(sk)) score += pointsPerSkill;
    });
  }

  if (targetLocation) {
    const targetLocList = (Array.isArray(targetLocation) ? targetLocation : targetLocation.split(','))
      .map(loc => loc.trim().toLowerCase())
      .filter(Boolean);
    if (targetLocList.some(targetLoc => location.includes(targetLoc))) score += 25;
  }

  const designationList = Array.isArray(targetDesignations) ? targetDesignations : [targetDesignations];
  if (designationList.some(d => d && currentTitle.includes(d.toLowerCase()))) score += 25;

  if (isCandidateOpenToWork(profile)) score += 15;

  return Math.min(Math.round(score), 100);
}

function Sidebar({ candidateCount, dbStatus, onOpenSettings, theme, toggleTheme }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isSearch = location.pathname === '/';
  const isCandidates = location.pathname === '/candidates';

  // Get status color/text
  const getDbBadge = () => {
    switch (dbStatus) {
      case 'connected':
        return { label: 'Shared DB', bg: 'var(--bg-main)', color: '#ededed', border: 'var(--border-color)', dot: '#ededed' };
      case 'connecting':
        return { label: 'Syncing...', bg: 'var(--bg-main)', color: '#a1a1aa', border: 'var(--border-color)', dot: '#f5a623' };
      case 'error':
        return { label: 'DB Error', bg: 'var(--bg-main)', color: '#ff0000', border: 'var(--border-color)', dot: '#ff0000' };
      default:
        return { label: 'Local', bg: 'var(--bg-main)', color: 'var(--text-secondary)', border: 'var(--border-color)', dot: 'var(--text-secondary)' };
    }
  };

  const badge = getDbBadge();

  return (
    <nav style={{
      width: '240px',
      height: '100vh',
      position: 'sticky', top: 0,
      backgroundColor: 'var(--bg-main)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex', flexDirection: 'column',
      padding: '24px 16px',
      boxSizing: 'border-box'
    }}>
      {/* Top section: Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px', paddingLeft: '8px' }}>
        <img src={logo} alt="Silicon Patterns" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
        <span style={{ fontWeight: '600', fontSize: '15px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Silicon Patterns
        </span>
      </div>
      
      {/* Navigation Links */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
        <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', paddingLeft: '8px' }}>Overview</div>
        {[
          { label: 'Search', path: '/', active: isSearch },
          { label: candidateCount > 0 ? `Candidates (${candidateCount})` : 'Candidates', path: '/candidates', active: isCandidates },
          { label: 'AI Agent Screening', path: '/agent', active: location.pathname === '/agent' },
          { label: 'Pipeline', path: '/pipeline', active: location.pathname === '/pipeline' },
        ].map(({ label, path, active }) => (
          <button key={path} onClick={() => navigate(path)} style={{
            padding: '8px 12px', borderRadius: '6px', fontSize: '13px',
            fontWeight: '500', border: 'none', cursor: 'pointer', textAlign: 'left',
            backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
            color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
            transition: 'all 0.15s ease',
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Bottom section: Theme, Settings, DB Status */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500' }}>Theme</span>
          <button 
            onClick={toggleTheme}
            style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-color)', cursor: 'pointer',
              padding: '2px', borderRadius: '16px', display: 'flex', alignItems: 'center',
              width: '40px', height: '22px', position: 'relative', transition: 'all 0.15s'
            }}
            title="Toggle Theme"
          >
            <span style={{ fontSize: '10px', marginLeft: '3px', opacity: theme === 'dark' ? 1 : 0, position: 'absolute', left: '2px' }}>🌙</span>
            <span style={{ fontSize: '10px', marginRight: '3px', opacity: theme === 'light' ? 1 : 0, position: 'absolute', right: '2px' }}>☀️</span>
            <div style={{
              width: '16px', height: '16px', backgroundColor: 'var(--text-primary)', borderRadius: '50%',
              transform: theme === 'dark' ? 'translateX(18px)' : 'translateX(0)',
              transition: 'transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)', zIndex: 1
            }} />
          </button>
        </div>

        <button 
          onClick={onOpenSettings}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
            padding: '8px 12px', borderRadius: '6px', fontSize: '13px', display: 'flex',
            alignItems: 'center', color: 'var(--text-secondary)', transition: 'all 0.15s', fontWeight: '500'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-surface)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          ⚙️ Settings
        </button>

        {/* DB Connection Badge */}
        <div style={{ padding: '0 8px' }}>
          <span style={{
            fontSize: '11px', fontWeight: '500',
            backgroundColor: badge.bg, 
            color: badge.color, 
            border: `1px solid ${badge.border}`,
            padding: '4px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '6px'
          }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: badge.dot }} />
            {badge.label}
          </span>
        </div>
      </div>
    </nav>
  );
}

function SearchPage({ masterLeads, setMasterLeads }) {
  const navigate = useNavigate();
  const [selectedSkills, setSelectedSkills] = useState(['UVM', 'SystemVerilog']);
  const [companies, setCompanies] = useState('');
  const [location, setLocation] = useState('Bengaluru');
  const [designation, setDesignation] = useState('Verification Engineer');
  const [experience, setExperience] = useState('3');
  const [openToWork, setOpenToWork] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [apifyRunUrl, setApifyRunUrl] = useState(null);
  const [latestRunResults, setLatestRunResults] = useState([]);
  const [skillFilter, setSkillFilter] = useState('');
  const [customSkill, setCustomSkill] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const availableSkills = selectedCategory === 'All' ? ASIC_SKILLS : ASIC_SKILLS_CATEGORIZED[selectedCategory];
  const filteredSkills = availableSkills.filter(s => s.toLowerCase().includes(skillFilter.toLowerCase()));

  const handleAddCustomSkill = () => {
    if (customSkill.trim() && !selectedSkills.includes(customSkill.trim())) {
      setSelectedSkills(prev => [...prev, customSkill.trim()]);
      setCustomSkill('');
    }
  };

  const toggleSkill = (skill) => {
    setSelectedSkills(prev => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (selectedSkills.length === 0) { alert("Please select at least one core skill."); return; }
    setLoading(true);
    setLatestRunResults([]);
    setApifyRunUrl(null);
    setStatus('Initiating search protocol...');

    try {
      let finalQuery = `(${selectedSkills.join(' OR ')})`;
      if (companies.trim() !== '') {
        const compArr = companies.split(',').map(c => `"${c.trim()}"`).join(' OR ');
        finalQuery += ` AND (${compArr})`;
      }
      if (openToWork) finalQuery += ' AND ("Open to work" OR "#opentowork" OR "looking for")';

      const designationTitles = designation.split(',').map(d => d.trim()).filter(Boolean);

      const targetLocations = location.split(',').map(l => l.trim()).filter(Boolean);

      const searchInput = {
        searchQuery: finalQuery,
        locations: targetLocations,
        currentJobTitles: designationTitles,
        ...(experience !== 'any' && { yearsOfExperienceIds: [experience] }),
        profileScraperMode: "Full",
        maxItems: 50
      };

      const currentApifyToken = localStorage.getItem('siliconPatternsApifyKey') || DEFAULT_APIFY_TOKEN;
      if (!currentApifyToken) { alert("Please provide an Apify API Key in Settings."); setLoading(false); return; }

      setStatus('Contacting Apify servers and launching actor...');
      const runResponse = await fetch(`https://api.apify.com/v2/acts/${ACTOR_NAME}/runs?token=${currentApifyToken}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchInput)
      });

      if (!runResponse.ok) throw new Error('Failed to run search process.');
      const runJson = await runResponse.json();
      const runId = runJson.data.id;
      const datasetId = runJson.data.defaultDatasetId;

      setApifyRunUrl(`https://console.apify.com/actors/runs/${runId}`);
      setStatus('Actor launched! Scraping deep profile data... (Please wait)');

      let runStatus = 'RUNNING';
      while (runStatus === 'RUNNING' || runStatus === 'READY') {
        await new Promise(resolve => setTimeout(resolve, 4000));
        const statusResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${currentApifyToken}`);
        const statusJson = await statusResponse.json();
        runStatus = statusJson.data.status;
        if (runStatus === 'SUCCEEDED') break;
        if (['FAILED', 'TIMED-OUT', 'ABORTED'].includes(runStatus)) throw new Error(`Execution terminated: ${runStatus}`);
      }

      setStatus('Extracting dataset and running deduplication algorithm...');
      const datasetResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${currentApifyToken}`);
      if (!datasetResponse.ok) throw new Error('Failed to pull final data array.');
      let profiles = await datasetResponse.json();

      if (openToWork) {
        profiles = profiles.filter(p => isCandidateOpenToWork(p));
      }

      if (!profiles || profiles.length === 0) {
        setStatus('No matching records found with these exact parameters.');
        setLoading(false);
        return;
      }

      const existingUrls = new Set(masterLeads.map(lead => cleanUrl(lead.linkedinUrl || lead.url)));
      const newUniqueProfiles = [];

      profiles.forEach(profile => {
        const profileUrl = cleanUrl(profile.linkedinUrl || profile.url);
        if (!existingUrls.has(profileUrl)) {
          profile.matchScore = calculateCandidateScore(profile, selectedSkills, location, designationTitles);
          profile._searchedDesignation = designationTitles.join(', ');
          profile._searchedLocation = location;
          profile._searchedSkills = [...selectedSkills];
          newUniqueProfiles.push(profile);
          existingUrls.add(profileUrl);
        }
      });

      if (newUniqueProfiles.length === 0) {
        setStatus('Search complete — all candidates already in your Master Database.');
        setLoading(false);
        return;
      }

      newUniqueProfiles.sort((a, b) => b.matchScore - a.matchScore);
      setLatestRunResults(newUniqueProfiles);

      const updatedMaster = [...masterLeads, ...newUniqueProfiles];
      updatedMaster.sort((a, b) => b.matchScore - a.matchScore);
      setMasterLeads(updatedMaster);

      setStatus(`Found ${profiles.length} profiles. Added ${newUniqueProfiles.length} NEW candidates to Master Database.`);
    } catch (error) {
      console.error(error);
      setStatus(`System Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 12px', boxSizing: 'border-box',
    borderRadius: '6px', border: '1px solid var(--border-color)',
    fontSize: '14px', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit',
    backgroundColor: 'var(--bg-main)',
  };
  const labelStyle = {
    display: 'block', fontSize: '11px', fontWeight: '600',
    color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em',
  };

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Targeted Search</h1>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>Configure parameters and launch a LinkedIn scrape to find candidates.</p>
        </div>
        {masterLeads.length > 0 && (
          <button onClick={() => navigate('/candidates')} style={{ padding: '8px 16px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500', transition: 'all 0.15s' }}>
            View {masterLeads.length} Candidates →
          </button>
        )}
      </div>

      <div style={{ backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)', padding: '24px' }}>

        <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <div>
            <label style={labelStyle}>Core Competency Matrix</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(140px, 1fr) minmax(160px, auto)', gap: '12px', marginBottom: '12px' }}>
              <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} style={inputStyle}>
                <option value="All">All Categories</option>
                {Object.keys(ASIC_SKILLS_CATEGORIZED).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="text"
                placeholder="Search category skills..."
                value={skillFilter}
                onChange={e => setSkillFilter(e.target.value)}
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Custom skill..."
                  value={customSkill}
                  onChange={e => setCustomSkill(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' ? (e.preventDefault(), handleAddCustomSkill()) : null}
                  style={inputStyle}
                />
                <button type="button" onClick={handleAddCustomSkill} style={{
                  padding: '0 16px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', border: 'none',
                  borderRadius: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer'
                }}>Add</button>
              </div>
            </div>

            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '200px', overflowY: 'auto',
              padding: '12px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '6px'
            }}>
              {selectedSkills.map(skill => (
                <button key={skill} type="button" onClick={() => toggleSkill(skill)} style={{
                  padding: '5px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '500',
                  cursor: 'pointer', transition: 'all 0.15s ease',
                  border: '1px solid var(--accent)', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
                }}>{skill} ✕</button>
              ))}

              {filteredSkills.filter(s => !selectedSkills.includes(s)).map(skill => (
                <button key={skill} type="button" onClick={() => toggleSkill(skill)} style={{
                  padding: '5px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '500',
                  cursor: 'pointer', transition: 'all 0.15s ease',
                  border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)',
                }}>{skill}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <label style={labelStyle}>Designation(s) <span style={{ textTransform: 'none', fontWeight: '400', color: 'var(--text-secondary)' }}>(comma-separated)</span></label>
              <input type="text" value={designation} onChange={e => setDesignation(e.target.value)} placeholder="e.g. Verification Engineer, ASIC Engineer" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Experience Bracket</label>
              <select value={experience} onChange={e => setExperience(e.target.value)} style={{ ...inputStyle }}>
                <option value="any">Any Experience</option>
                <option value="2">Junior (1-2 years)</option>
                <option value="3">Mid-Level (3-5 years)</option>
                <option value="4">Senior (5-7 years)</option>
                <option value="5">Lead/Staff (7-10+ years)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <label style={labelStyle}>Target Location(s) (comma-separated)</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Bengaluru, Hyderabad" style={inputStyle} required />
            </div>
            <div>
              <label style={labelStyle}>Target Companies (Optional)</label>
              <input type="text" value={companies} onChange={e => setCompanies(e.target.value)} placeholder="e.g. Intel, Qualcomm, AMD" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 0' }}>
            <input type="checkbox" id="openToWork" checked={openToWork} onChange={e => setOpenToWork(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
            <label htmlFor="openToWork" style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>Enforce "Open to Work" profile requirements</label>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" disabled={loading} style={{
              padding: '10px 20px', backgroundColor: loading ? 'var(--border-color)' : 'var(--accent)',
              color: 'var(--accent-fg)', border: 'none', borderRadius: '6px',
              fontSize: '14px', fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
            }}>
              {loading ? 'Executing Data Scrape...' : 'Run Targeted Search'}
            </button>
          </div>
        </form>

        {status && (
          <div style={{ marginTop: '20px', padding: '14px 16px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', flexShrink: 0, backgroundColor: loading ? '#eab308' : '#10b981', borderRadius: '50%', boxShadow: loading ? '0 0 8px #eab308' : '0 0 8px #10b981' }} />
              <span>{status}</span>
            </div>
            {apifyRunUrl && (
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>🔴 Live Run:</span>
                <a href={apifyRunUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: '600', textDecoration: 'none' }}>
                  Watch on Apify Console →
                </a>
              </div>
            )}
          </div>
        )}

        {latestRunResults.length > 0 && (
          <div style={{ marginTop: '32px', paddingTop: '28px', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '500', color: 'var(--text-primary)' }}>{latestRunResults.length} New Candidates Added</h3>
              <button onClick={() => navigate('/candidates')} style={{ padding: '6px 14px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
                View All in Database →
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {latestRunResults.slice(0, 5).map((p, idx) => (
                <div key={idx} style={{ padding: '12px 16px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{safeExtractText(p.firstName)} {safeExtractText(p.lastName)}</span>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>{safeExtractText(p.currentTitle || p.jobTitle || p.headline).substring(0, 60)}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '500', border: '1px solid var(--border-color)'
                    }}>{p.matchScore} Match</span>
                    <a href={safeExtractText(p.linkedinUrl || p.url)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '600', textDecoration: 'none' }}>↗</a>
                  </div>
                </div>
              ))}
              {latestRunResults.length > 5 && (
                <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>+{latestRunResults.length - 5} more in the Candidates page</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [masterLeads, setMasterLeads] = useState([]);
  
  // Database Config State
  const [useSupabase, setUseSupabase] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [dbStatus, setDbStatus] = useState('local'); // 'local' | 'connecting' | 'connected' | 'error'
  const [showSettings, setShowSettings] = useState(false);
  
  // Theme State
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('siliconPatternsTheme') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('siliconPatternsTheme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };
  
  // Settings Inputs
  const [inputUrl, setInputUrl] = useState('');
  const [inputKey, setInputKey] = useState('');
  const [inputUseSupabase, setInputUseSupabase] = useState(false);
  const [inputApifyKey, setInputApifyKey] = useState('');
  const [inputGroqKey, setInputGroqKey] = useState('');
  const [showSqlHelp, setShowSqlHelp] = useState(false);

  // Load configuration on mount
  useEffect(() => {
    const dbMode = localStorage.getItem('siliconPatternsDbMode') === 'supabase';
    const dbUrl = localStorage.getItem('siliconPatternsSupabaseUrl') || '';
    const dbKey = localStorage.getItem('siliconPatternsSupabaseKey') || '';
    
    setUseSupabase(dbMode);
    setSupabaseUrl(dbUrl);
    setSupabaseKey(dbKey);
    
    setInputUseSupabase(dbMode);
    setInputUrl(dbUrl);
    setInputKey(dbKey);
    setInputApifyKey(localStorage.getItem('siliconPatternsApifyKey') || '');
    setInputGroqKey(localStorage.getItem('siliconPatternsGroqApiKey') || '');

    if (dbMode && dbUrl && dbKey) {
      setDbStatus('connecting');
      import('./supabase.js')
        .then(({ fetchCandidatesFromSupabase }) => {
          return fetchCandidatesFromSupabase(dbUrl, dbKey);
        })
        .then(data => {
          setMasterLeads(data);
          setDbStatus('connected');
        })
        .catch(err => {
          console.error("Failed to sync Supabase database on load:", err);
          setDbStatus('error');
          // Fallback to local storage candidates
          const savedData = localStorage.getItem('siliconPatternsMasterDatabase');
          if (savedData) {
            try { setMasterLeads(JSON.parse(savedData)); }
            catch (e) {}
          }
        });
    } else {
      const savedData = localStorage.getItem('siliconPatternsMasterDatabase');
      if (savedData) {
        try { setMasterLeads(JSON.parse(savedData)); }
        catch (e) { console.error("Failed to load local database", e); }
      }
    }
  }, []);

  // Intercept and synchronize all leads mutations (creates, updates, deletes)
  const syncMasterLeads = async (newLeads) => {
    const resolvedLeads = typeof newLeads === 'function' ? newLeads(masterLeads) : newLeads;
    
    setMasterLeads(resolvedLeads);
    
    if (resolvedLeads.length === 0) {
      localStorage.removeItem('siliconPatternsMasterDatabase');
    } else {
      localStorage.setItem('siliconPatternsMasterDatabase', JSON.stringify(resolvedLeads));
    }

    if (useSupabase && supabaseUrl && supabaseKey) {
      try {
        const { upsertCandidatesToSupabase, deleteCandidateFromSupabase } = await import('./supabase.js');
        
        // Handle deletion: find if any candidate was removed
        if (resolvedLeads.length < masterLeads.length) {
          const resolvedUrls = new Set(resolvedLeads.map(l => l.linkedinUrl || l.url));
          const removedCandidates = masterLeads.filter(l => !resolvedUrls.has(l.linkedinUrl || l.url));
          for (const cand of removedCandidates) {
            await deleteCandidateFromSupabase(supabaseUrl, supabaseKey, cand).catch(e => console.error(e));
          }
        }
        
        // Upsert active leads
        if (resolvedLeads.length > 0) {
          await upsertCandidatesToSupabase(supabaseUrl, supabaseKey, resolvedLeads);
        }
      } catch (err) {
        console.error("Failed to sync updates to Supabase:", err);
        setDbStatus('error');
      }
    }
  };

  // Connect & migrate local storage to online shared database
  const handleConnectSupabase = async (e) => {
    e.preventDefault();
    
    // Save API Keys globally
    localStorage.setItem('siliconPatternsApifyKey', inputApifyKey);
    localStorage.setItem('siliconPatternsGroqApiKey', inputGroqKey);
    
    if (inputUseSupabase && (!inputUrl.trim() || !inputKey.trim())) {
      alert("Please enter a valid Supabase URL and API Key.");
      return;
    }

    setDbStatus('connecting');
    try {
      if (inputUseSupabase) {
        const { fetchCandidatesFromSupabase, upsertCandidatesToSupabase } = await import('./supabase.js');
        
        // 1. Fetch remote candidates
        const remoteCandidates = await fetchCandidatesFromSupabase(inputUrl, inputKey);
        
        // 2. Perform two-way merge
        const mergedMap = new Map();
        
        // Place local leads first
        masterLeads.forEach(c => {
          const u = (c.linkedinUrl || c.url || '').split('?')[0].toLowerCase().trim();
          if (u) mergedMap.set(u, c);
        });
        
        // Merge in remote leads, keeping newer metrics
        remoteCandidates.forEach(c => {
          const u = (c.linkedinUrl || c.url || '').split('?')[0].toLowerCase().trim();
          if (u) {
            const local = mergedMap.get(u);
            if (local) {
              mergedMap.set(u, {
                ...local,
                ...c,
                matchScore: Math.max(local.matchScore || 0, c.matchScore || 0),
                status: c.status || local.status || 'sourced'
              });
            } else {
              mergedMap.set(u, c);
            }
          }
        });

        const mergedLeads = Array.from(mergedMap.values());
        
        // 3. Push complete dataset back to Supabase
        if (mergedLeads.length > 0) {
          await upsertCandidatesToSupabase(inputUrl, inputKey, mergedLeads);
        }

        // 4. Update state and config
        setMasterLeads(mergedLeads);
        localStorage.setItem('siliconPatternsMasterDatabase', JSON.stringify(mergedLeads));
        
        localStorage.setItem('siliconPatternsDbMode', 'supabase');
        localStorage.setItem('siliconPatternsSupabaseUrl', inputUrl);
        localStorage.setItem('siliconPatternsSupabaseKey', inputKey);
        
        setUseSupabase(true);
        setSupabaseUrl(inputUrl);
        setSupabaseKey(inputKey);
        setDbStatus('connected');
        alert("Connected and synced successfully! You are now working on a shared database.");
      } else {
        // Disabling Supabase, fallback to local storage mode
        localStorage.setItem('siliconPatternsDbMode', 'local');
        setUseSupabase(false);
        setDbStatus('local');
        alert("Database connection deactivated. Switched back to Local Browser Storage.");
      }
      setShowSettings(false);
    } catch (err) {
      console.error(err);
      setDbStatus('error');
      alert(`Database connection failed:\n${err.message}`);
    }
  };

  const sqlCode = `create table candidates (
  linkedin_url text primary key,
  first_name text,
  last_name text,
  headline text,
  current_title text,
  location text,
  match_score integer,
  status text default 'sourced',
  agent_score integer,
  agent_reasoning text,
  profile_data jsonb,
  created_at timestamptz default now()
);

-- Disable row-level security so anyone can read/write without login
alter table candidates disable row level security;`;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-main)', fontFamily: 'var(--sans)', color: 'var(--text-primary)' }}>
      <Sidebar candidateCount={masterLeads.length} dbStatus={dbStatus} onOpenSettings={() => setShowSettings(true)} theme={theme} toggleTheme={toggleTheme} />
      
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Routes>
          <Route path="/" element={<SearchPage masterLeads={masterLeads} setMasterLeads={syncMasterLeads} />} />
          <Route path="/candidates" element={<CandidatesPage masterLeads={masterLeads} setMasterLeads={syncMasterLeads} />} />
          <Route path="/agent" element={<AIAgentPage masterLeads={masterLeads} setMasterLeads={syncMasterLeads} />} />
          <Route path="/pipeline" element={<PipelinePage masterLeads={masterLeads} setMasterLeads={syncMasterLeads} />} />
        </Routes>
      </div>

      {/* Settings Modal Dialog */}
      {showSettings && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '20px',
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface)', borderRadius: '12px', maxWidth: '560px', width: '100%',
            maxHeight: '90vh', overflowY: 'auto', padding: '28px', border: '1px solid var(--border-color)',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
                ⚙️ Workspace Settings
              </h3>
              <button 
                onClick={() => setShowSettings(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >×</button>
            </div>

            {/* Modal Body: Connection Settings */}
            <form onSubmit={handleConnectSupabase} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>API Keys</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                      Apify API Key (LinkedIn Scraping)
                    </label>
                    <input
                      type="password"
                      value={inputApifyKey}
                      onChange={e => setInputApifyKey(e.target.value)}
                      placeholder="apify_api_..."
                      style={{
                        width: '100%', padding: '8px 12px', boxSizing: 'border-box',
                        borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px',
                        backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                      Groq API Key (AI Agent)
                    </label>
                    <input
                      type="password"
                      value={inputGroqKey}
                      onChange={e => setInputGroqKey(e.target.value)}
                      placeholder="gsk_..."
                      style={{
                        width: '100%', padding: '8px 12px', boxSizing: 'border-box',
                        borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px',
                        backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)'
                      }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>Database Settings</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <input
                    type="checkbox"
                    id="enableDb"
                    checked={inputUseSupabase}
                    onChange={e => setInputUseSupabase(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#18181b', cursor: 'pointer' }}
                  />
                  <label htmlFor="enableDb" style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                    Connect Shared Supabase Database (No Login Required)
                  </label>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  Enabling this connects your recruiter database to a shared online cloud database. Multiple recruiters can share and updates will automatically sync across devices.
                </p>
              </div>

              {inputUseSupabase && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                      Supabase Project URL
                    </label>
                    <input
                      type="text"
                      value={inputUrl}
                      onChange={e => setInputUrl(e.target.value)}
                      placeholder="https://your-project-id.supabase.co"
                      required={inputUseSupabase}
                      style={{
                        width: '100%', padding: '8px 12px', boxSizing: 'border-box',
                        borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px',
                        backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                      Supabase Public Anon API Key
                    </label>
                    <input
                      type="password"
                      value={inputKey}
                      onChange={e => setInputKey(e.target.value)}
                      placeholder="eyJhbGciOi..."
                      required={inputUseSupabase}
                      style={{
                        width: '100%', padding: '8px 12px', boxSizing: 'border-box',
                        borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px',
                        backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)'
                      }}
                    />
                  </div>

                  {/* SQL Schema Instruction Dropdown */}
                  <div style={{ marginTop: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setShowSqlHelp(!showSqlHelp)}
                      style={{
                        background: 'none', border: 'none', padding: 0, color: 'var(--accent)',
                        fontSize: '11px', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline'
                      }}
                    >
                      {showSqlHelp ? 'Hide SQL Table Setup Instructions' : 'View SQL Table Setup Instructions'}
                    </button>
                    
                    {showSqlHelp && (
                      <div style={{ marginTop: '8px' }}>
                        <p style={{ margin: '0 0 6px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                          Paste this code into the <strong>SQL Editor</strong> tab inside your Supabase project dashboard to create the candidate table with disabled RLS:
                        </p>
                        <pre style={{
                          margin: 0, padding: '10px', backgroundColor: '#000', color: '#fff', border: '1px solid var(--border-color)',
                          borderRadius: '6px', fontSize: '10px', overflowX: 'auto', fontFamily: 'monospace',
                          lineHeight: '1.4'
                        }}>
                          {sqlCode}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px' }}>
                <button 
                  type="button"
                  onClick={() => setShowSettings(false)}
                  style={{
                    padding: '8px 16px', backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer',
                    fontSize: '12px', fontWeight: '600'
                  }}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  style={{
                    padding: '8px 16px', backgroundColor: 'var(--accent)', color: '#000',
                    border: 'none', borderRadius: '6px', cursor: 'pointer',
                    fontSize: '12px', fontWeight: '700'
                  }}
                >
                  Save & Sync Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
