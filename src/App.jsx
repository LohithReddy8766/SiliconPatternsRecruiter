import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './AuthContext';
import LoginPage from './LoginPage';
import AdminPage from './AdminPage';
import CandidatesPage from './CandidatesPage.jsx';
import AIAgentPage from './AIAgentPage.jsx';
import PipelinePage from './PipelinePage.jsx';
import AnalyticsPage from './AnalyticsPage.jsx';
import { ASIC_SKILLS, ASIC_SKILLS_CATEGORIZED } from './skills.js';
import logo from './assets/logo.png';

const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  if (loading) return null;
  if (!currentUser) return <Navigate to="/login" replace />;
  return children;
};

const DEFAULT_APIFY_TOKEN = import.meta.env.VITE_APIFY_API_TOKEN || '';
const ACTOR_NAME = 'harvestapi~linkedin-profile-search';

export function safeExtractText(field) {
  if (field === null || field === undefined) return 'N/A';
  if (typeof field === 'string') {
    const trimmed = field.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.linkedinText) return parsed.linkedinText;
        return Object.values(parsed).filter(val => typeof val === 'string' || typeof val === 'number').join(' ');
      } catch (e) {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (Array.isArray(field)) {
    return field.map(item => {
      if (typeof item === 'object') return Object.values(item).filter(v => typeof v === 'string').join(' ');
      return String(item);
    }).join(' | ');
  }
  if (typeof field === 'object') {
    if (field.linkedinText) return field.linkedinText;
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

const designationOptions = [
  "Verification Engineer", "ASIC Design Engineer", "Physical Design Engineer",
  "DFT Engineer", "SoC Architect", "Analog Design Engineer", "RTL Design Engineer"
];
const locationOptions = [
  "Bengaluru", "Hyderabad", "Pune", "Noida", "Chennai", "Delhi NCR", "Mumbai", "Ahmedabad",
  "San Jose", "San Francisco", "Austin", "Portland", "Phoenix", "Boston", "San Diego", "Dallas", "Seattle", "Raleigh", "New York",
  "Hsinchu", "Taipei", "Seoul", "Tokyo", "Singapore",
  "Munich", "Cambridge", "Eindhoven", "Dublin", "London", "Berlin", "Paris", "Stockholm",
  "Haifa", "Tel Aviv",
  "Toronto", "Vancouver",
  "Remote", "India", "United States", "Europe", "Worldwide"
];
const companyOptions = [
  "Intel", "AMD", "Qualcomm", "NVIDIA", "Apple", "Broadcom", "MediaTek", "Marvell", "Texas Instruments", "Arm"
];
const experienceOptions = [
  { label: "Junior (1-2 years)", value: "2" },
  { label: "Mid-Level (3-5 years)", value: "3" },
  { label: "Senior (5-7 years)", value: "4" },
  { label: "Lead/Staff (7-10+ years)", value: "5" },
  { label: "Director/Exec (12+ years)", value: "6" }
];

function TagSelect({ options, selected, onChange, placeholder, allowCustom = true }) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      if (allowCustom && !selected.includes(inputValue.trim())) {
        onChange([...selected, inputValue.trim()]);
      }
      setInputValue('');
      setIsOpen(false);
    }
  };

  const toggleOption = (val) => {
    if (selected.includes(val)) {
      onChange(selected.filter(x => x !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const removeTag = (val, e) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(selected.filter(x => x !== val));
  };

  const getLabel = (val) => {
    const opt = options.find(o => (typeof o === 'object' ? o.value === val : o === val));
    return opt ? (typeof opt === 'object' ? opt.label : opt) : val;
  };

  const filteredOptions = options.filter(o => {
    const label = typeof o === 'object' ? o.label : o;
    const val = typeof o === 'object' ? o.value : o;
    return label.toLowerCase().includes(inputValue.toLowerCase()) && !selected.includes(val);
  });

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={() => setIsOpen(true)}
        style={{
          display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center',
          backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
          borderRadius: '6px', padding: '6px 12px', minHeight: '42px', cursor: 'text'
        }}
      >
        {selected.map(val => (
          <span key={val} style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '500'
          }}>
            {getLabel(val)}
            <span onClick={(e) => removeTag(val, e)} style={{ cursor: 'pointer', fontWeight: 'bold', marginLeft: '4px', color: 'var(--text-secondary)' }}>×</span>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={e => { setInputValue(e.target.value); setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder={selected.length === 0 ? placeholder : ''}
          style={{
            border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)',
            fontSize: '13px', flex: 1, minWidth: '120px'
          }}
        />
      </div>
      {isOpen && (filteredOptions.length > 0 || (allowCustom && inputValue.trim())) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)',
          borderRadius: '6px', marginTop: '4px', maxHeight: '200px', overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
        }}>
          {filteredOptions.map(opt => {
            const val = typeof opt === 'object' ? opt.value : opt;
            const label = typeof opt === 'object' ? opt.label : opt;
            return (
              <div
                key={val}
                onClick={() => { toggleOption(val); setInputValue(''); }}
                style={{
                  padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)',
                  borderBottom: '1px solid var(--border-color)'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-main)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {label}
              </div>
            );
          })}
          {allowCustom && inputValue.trim() && !options.some(o => (typeof o === 'object' ? o.label : o).toLowerCase() === inputValue.trim().toLowerCase()) && (
            <div
              onClick={() => {
                if (!selected.includes(inputValue.trim())) onChange([...selected, inputValue.trim()]);
                setInputValue('');
              }}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: 'var(--accent)', fontStyle: 'italic'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-main)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              Add custom "{inputValue.trim()}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Sidebar({ candidateCount, dbStatus, onOpenSettings, theme, toggleTheme }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useAuth();
  const isSearch = location.pathname === '/' || location.pathname === '/search';
  const isCandidates = location.pathname === '/candidates';

  // Get status color/text
  const getDbBadge = () => {
    switch (dbStatus) {
      case 'connected':
        return { label: 'Shared DB', bg: 'var(--bg-main)', color: 'var(--text-primary)', border: 'var(--border-color)', dot: '#10b981' };
      case 'connecting':
        return { label: 'Syncing...', bg: 'var(--bg-main)', color: 'var(--text-secondary)', border: 'var(--border-color)', dot: '#f5a623' };
      case 'error':
        return { label: 'DB Error', bg: 'var(--bg-main)', color: '#ef4444', border: 'var(--border-color)', dot: '#ef4444' };
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
        <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', paddingLeft: '8px' }}>Workspace</div>
        {[
          { label: 'Discovery', path: '/search', active: isSearch, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> },
          { label: candidateCount > 0 ? `Talent Pool (${candidateCount})` : 'Talent Pool', path: '/candidates', active: isCandidates, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg> },
          { label: 'Evaluation', path: '/agent', active: location.pathname === '/agent', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg> },
          { label: 'Recruitment', path: '/pipeline', active: location.pathname === '/pipeline', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg> },
          { label: 'Insights', path: '/analytics', active: location.pathname === '/analytics', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg> },
          ...(currentUser?.role === 'admin' ? [{ label: 'Admin Dashboard', path: '/admin', active: location.pathname === '/admin', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg> }] : [])
        ].map(({ label, path, active, icon }) => (
          <button key={path} onClick={() => navigate(path)} style={{
            padding: '10px 12px', borderRadius: '8px', fontSize: '13px',
            fontWeight: active ? '600' : '500', border: 'none', cursor: 'pointer', textAlign: 'left',
            backgroundColor: active ? 'var(--accent)' : 'transparent',
            color: active ? 'var(--accent-fg)' : 'var(--text-secondary)',
            transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', gap: '12px',
            boxShadow: active ? '0 4px 12px rgba(0, 229, 255, 0.2)' : 'none'
          }}
          onMouseEnter={e => { if(!active) { e.currentTarget.style.backgroundColor = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
          onMouseLeave={e => { if(!active) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: active ? 1 : 0.7 }}>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Bottom section: DB Status, Theme, Settings, Logout */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
              padding: '8px 12px', borderRadius: '8px', fontSize: '13px', display: 'flex',
              alignItems: 'center', gap: '12px', color: 'var(--text-secondary)', transition: 'all 0.15s', fontWeight: '500',
              flex: 1
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg></span>
            Logout
          </button>

          <div style={{ display: 'flex', gap: '4px', paddingRight: '8px' }}>
            <button
              onClick={onOpenSettings}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', borderRadius: '6px', transition: 'all 0.15s' }}
              title="Settings"
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            </button>
            <button
              onClick={toggleTheme}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', borderRadius: '6px', transition: 'all 0.15s' }}
              title="Toggle Theme"
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              {theme === 'dark' ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

function SearchPage({ masterLeads, setMasterLeads }) {
  const navigate = useNavigate();
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [location, setLocation] = useState([]);
  const [designation, setDesignation] = useState([]);
  const [experience, setExperience] = useState([]);
  const [openToWork, setOpenToWork] = useState(false);
  const [maxItems, setMaxItems] = useState(100);
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
      const expandSkillForQuery = (skill) => {
        const matchGen = skill.match(/^(.+?)\s+Gen(\d+)$/i);
        if (matchGen) {
          const base = matchGen[1];
          const gen = matchGen[2];
          return `("${skill}" OR "${base} Gen ${gen}" OR "${base} ${gen}.0" OR "${base} ${gen}")`;
        }
        return `"${skill}"`;
      };

      let finalQuery = `(${selectedSkills.map(expandSkillForQuery).join(' AND ')})`;
      if (companies.length > 0) {
        const compArr = companies.map(c => `"${c.trim()}"`).join(' OR ');
        finalQuery += ` AND (${compArr})`;
      }
      if (openToWork) finalQuery += ' AND ("Open to work" OR "#opentowork" OR "looking for")';

      const searchInput = {
        searchQuery: finalQuery,
        ...(location.length > 0 && { locations: location }),
        ...(designation.length > 0 && { currentJobTitles: designation }),
        ...(experience.length > 0 && { yearsOfExperienceIds: experience }),
        profileScraperMode: "Full",
        maxItems: maxItems
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
          const prunedProfile = {
            firstName: profile.firstName,
            lastName: profile.lastName,
            headline: profile.headline,
            currentTitle: profile.currentTitle || profile.jobTitle,
            location: profile.location,
            about: profile.about || profile.summary,
            skills: profile.skills,
            positions: profile.positions || profile.experience,
            educations: profile.educations || profile.education,
            linkedinUrl: profile.linkedinUrl || profile.url,
            url: profile.url,
            isOpenToWork: profile.isOpenToWork,
            matchScore: null,
            status: 'sourced',
            _searchedDesignation: designation.join(', '),
            _searchedLocation: location.join(', '),
            _searchedSkills: [...selectedSkills],
            createdAt: new Date().toISOString()
          };
          newUniqueProfiles.push(prunedProfile);
          existingUrls.add(profileUrl);
        }
      });

      if (newUniqueProfiles.length === 0) {
        setStatus('Search complete — all candidates already in your Master Database.');
        setLoading(false);
        return;
      }

      const getEffectiveScore = (p) => (p.agentScore !== undefined && p.agentScore !== null) ? p.agentScore : 0;
      newUniqueProfiles.sort((a, b) => getEffectiveScore(b) - getEffectiveScore(a));
      setLatestRunResults(newUniqueProfiles);

      const updatedMaster = [...masterLeads, ...newUniqueProfiles];
      updatedMaster.sort((a, b) => getEffectiveScore(b) - getEffectiveScore(a));
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
      </div>

      <div style={{ backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)', padding: '24px' }}>

        <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <div>
            <label style={labelStyle}>Core Competency Matrix</label>

            {/* Selected skills as removable tags */}
            {selectedSkills.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                {selectedSkills.map(skill => (
                  <button key={skill} type="button" onClick={() => toggleSkill(skill)} style={{
                    padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
                    cursor: 'pointer', transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center', gap: '4px',
                    border: '1px solid var(--accent)', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
                  }}>{skill} <span style={{ fontSize: '14px', lineHeight: 1 }}>×</span></button>
                ))}
                <button type="button" onClick={() => setSelectedSkills([])} style={{
                  padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '500',
                  cursor: 'pointer', border: '1px solid rgba(248, 113, 113, 0.3)',
                  backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#f87171',
                }}>Clear all</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <select value={selectedCategory} onChange={e => { setSelectedCategory(e.target.value); setSkillFilter(''); }} style={{ ...inputStyle, width: '180px', flex: 'none' }}>
                <option value="All">All Categories</option>
                {Object.keys(ASIC_SKILLS_CATEGORIZED).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="text"
                placeholder="Type to search skills..."
                value={skillFilter}
                onChange={e => setSkillFilter(e.target.value)}
                style={{ ...inputStyle, flex: 1, minWidth: '200px' }}
              />
              <div style={{ display: 'flex', gap: '8px', flex: 'none' }}>
                <input
                  type="text"
                  placeholder="Custom skill..."
                  value={customSkill}
                  onChange={e => setCustomSkill(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' ? (e.preventDefault(), handleAddCustomSkill()) : null}
                  style={{ ...inputStyle, width: '140px' }}
                />
                <button type="button" onClick={handleAddCustomSkill} style={{
                  padding: '0 16px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', border: 'none',
                  borderRadius: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer'
                }}>Add</button>
              </div>
            </div>

            {/* Skill results */}
            {(() => {
              const unselectedSkills = filteredSkills.filter(s => !selectedSkills.includes(s));
              const shouldShow = skillFilter.trim() || selectedCategory !== 'All';

              if (!shouldShow) return null;

              return (
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '160px', overflowY: 'auto',
                  padding: '12px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px'
                }}>
                  {unselectedSkills.length === 0 ? (
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '4px 0' }}>
                      {skillFilter ? 'No skills match your search' : 'All skills in this category are selected'}
                    </span>
                  ) : (
                    unselectedSkills.map(skill => (
                      <button key={skill} type="button" onClick={() => toggleSkill(skill)} style={{
                        padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '500',
                        cursor: 'pointer', transition: 'all 0.12s ease',
                        border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                      >{skill}</button>
                    ))
                  )}
                </div>
              );
            })()}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <label style={labelStyle}>Designation(s) <span style={{ textTransform: 'none', fontWeight: '400', color: 'var(--text-secondary)' }}>(comma-separated)</span></label>
              <TagSelect
                options={designationOptions}
                selected={designation}
                onChange={setDesignation}
                placeholder="e.g. Verification Engineer"
              />
            </div>
            <div>
              <label style={labelStyle}>Experience Bracket</label>
              <TagSelect
                options={experienceOptions}
                selected={experience}
                onChange={setExperience}
                placeholder="Select experience levels"
                allowCustom={false}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <label style={labelStyle}>Target Location(s) (comma-separated)</label>
              <TagSelect
                options={locationOptions}
                selected={location}
                onChange={setLocation}
                placeholder="e.g. Bengaluru, Hyderabad"
              />
            </div>
            <div>
              <label style={labelStyle}>Target Companies (Optional)</label>
              <TagSelect
                options={companyOptions}
                selected={companies}
                onChange={setCompanies}
                placeholder="e.g. Intel, Qualcomm, AMD"
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
            <div
              onClick={() => setOpenToWork(!openToWork)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', cursor: 'pointer', width: 'fit-content' }}
            >
              <div style={{
                width: '36px', height: '20px', backgroundColor: openToWork ? 'var(--accent)' : 'var(--bg-surface)',
                borderRadius: '20px', position: 'relative', transition: 'background-color 0.2s',
                border: `1px solid ${openToWork ? 'var(--accent)' : 'var(--border-color)'}`
              }}>
                <div style={{
                  width: '14px', height: '14px', backgroundColor: openToWork ? 'var(--accent-fg)' : 'var(--text-secondary)',
                  borderRadius: '50%', position: 'absolute', top: '2px', left: openToWork ? '18px' : '2px',
                  transition: 'all 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                }} />
              </div>
              <span style={{ fontSize: '13px', fontWeight: '500', color: openToWork ? 'var(--text-primary)' : 'var(--text-secondary)', userSelect: 'none', transition: 'color 0.2s' }}>
                Open to Work
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Max Items to Scrape:</label>
              <input 
                type="number" 
                value={maxItems} 
                onChange={(e) => setMaxItems(parseInt(e.target.value) || 100)}
                min="1"
                max="2000"
                style={{ 
                  width: '80px', padding: '8px 12px', borderRadius: '6px', 
                  border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-main)', 
                  color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', fontSize: '13px'
                }} 
              />
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" disabled={loading} title="Run Targeted Search" style={{
              padding: '10px', backgroundColor: loading ? 'var(--border-color)' : 'var(--accent)',
              color: 'var(--accent-fg)', border: 'none', borderRadius: '6px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s', width: '40px', height: '40px'
            }}>
              {loading ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                  <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              )}
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
                <span style={{ display: 'inline-block', width: '8px', height: '8px', flexShrink: 0, backgroundColor: '#ef4444', borderRadius: '50%', boxShadow: '0 0 8px #ef4444' }} />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Live Run:</span>
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
                    {p.agentScore !== undefined && p.agentScore !== null && (
                      <span style={{
                        backgroundColor: 'rgba(0, 229, 255, 0.15)',
                        color: 'var(--accent)',
                        padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '500', border: '1px solid rgba(0, 229, 255, 0.3)'
                      }}>Score: {p.agentScore}</span>
                    )}
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
        });
    }
  }, []);

  // Intercept and synchronize all leads mutations (creates, updates, deletes)
  const syncMasterLeads = async (newLeads) => {
    const resolvedLeads = typeof newLeads === 'function' ? newLeads(masterLeads) : newLeads;

    setMasterLeads(resolvedLeads);



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
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || 'dummy-client-id'}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={
            <ProtectedRoute>
              <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-main)', fontFamily: 'var(--sans)', color: 'var(--text-primary)' }}>
                <Sidebar candidateCount={masterLeads.length} dbStatus={dbStatus} onOpenSettings={() => setShowSettings(true)} theme={theme} toggleTheme={toggleTheme} />

                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/search" replace />} />
                    <Route path="/search" element={<SearchPage masterLeads={masterLeads} setMasterLeads={syncMasterLeads} />} />
                    <Route path="/candidates" element={<CandidatesPage masterLeads={masterLeads} setMasterLeads={syncMasterLeads} />} />
                    <Route path="/agent" element={<AIAgentPage masterLeads={masterLeads} setMasterLeads={syncMasterLeads} />} />
                    <Route path="/pipeline" element={<PipelinePage masterLeads={masterLeads} setMasterLeads={syncMasterLeads} />} />
                    <Route path="/analytics" element={<AnalyticsPage masterLeads={masterLeads} />} />
                    <Route path="/admin" element={<AdminPage />} />
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
                Workspace Settings
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
            </ProtectedRoute>
          } />
        </Routes>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
