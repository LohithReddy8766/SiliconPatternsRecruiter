import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
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
  // harvestapi returns this as `openToWork`; stored/legacy records use
  // `isOpenToWork`. Check both before falling back to text heuristics.
  if (profile.openToWork === true || profile.isOpenToWork === true) return true;
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
// harvestapi yearsOfExperienceIds is a fixed 1-5 scale. Value "6" is invalid
// and silently breaks the run, so the options are mapped to the real buckets.
const experienceOptions = [
  { label: "Less than 1 year", value: "1" },
  { label: "Junior (1-2 years)", value: "2" },
  { label: "Mid-Level (3-5 years)", value: "3" },
  { label: "Senior (6-10 years)", value: "4" },
  { label: "Lead/Staff (10+ years)", value: "5" }
];

// --- Job Description auto-parsing ---------------------------------------
// Short skills that are distinctive enough to keyword-match safely in the
// local fallback parser (longer skills are matched by length; these are the
// meaningful <4 char exceptions we don't want to drop).
const SHORT_SKILL_ALLOWLIST = new Set([
  'UVM', 'PCIe', 'DDR', 'AXI', 'JTAG', 'HLS', 'DFT', 'ATPG', 'BIST', 'MBIST',
  'UPF', 'CPF', 'CXL', 'MIPI', 'UFS', 'HBM', 'GDDR', 'eMMC', 'NVMe', 'SATA',
  'USB', 'STA', 'CTS', 'ECO', 'RTL', 'SoC', 'DDR2', 'DDR3', 'DDR4', 'DDR5'
]);
// FPGA/lab terms that aren't in the ASIC skills taxonomy but are worth
// pulling out of a JD so FPGA roles autofill sensibly.
const JD_EXTRA_TERMS = [
  'FPGA', 'Vivado', 'Quartus', 'Quartus Prime', 'Xilinx', 'Altera', 'Alveo',
  'Stratix', 'SignalTap', 'ChipScope', 'AXI', 'JTAG', 'Bitstream', 'HLS',
  'OpenCL', 'SmartNIC', 'PCIe', 'DDR', 'Linux', 'RTL'
];

// Match a term as a whole word (so "C" doesn't hit every word, "CAN" doesn't
// hit "can"). Treats +, # as word chars so "C++" / "C#" match correctly.
function jdContainsTerm(text, term) {
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return new RegExp(`(?<![A-Za-z0-9+#])${esc}(?![A-Za-z0-9+#])`, 'i').test(text);
  } catch {
    return text.toLowerCase().includes(term.toLowerCase());
  }
}

function yearsToExperienceId(years) {
  if (years < 1) return '1';
  if (years <= 2) return '2';
  if (years <= 5) return '3';
  if (years <= 10) return '4';
  return '5';
}

function mapExperienceRange(minYears, maxYears) {
  const ids = new Set();
  if (minYears != null && !isNaN(minYears)) ids.add(yearsToExperienceId(minYears));
  if (maxYears != null && !isNaN(maxYears)) ids.add(yearsToExperienceId(maxYears));
  return [...ids];
}

// Extract known/likely skills mentioned in a chunk of text.
function extractSkillsFromText(text) {
  const skillPool = [...ASIC_SKILLS, ...JD_EXTRA_TERMS];
  const seen = new Set();
  const skills = [];
  skillPool.forEach(sk => {
    const key = sk.toLowerCase();
    if (seen.has(key)) return;
    const eligible = sk.length >= 4 || SHORT_SKILL_ALLOWLIST.has(sk) || JD_EXTRA_TERMS.includes(sk);
    if (eligible && jdContainsTerm(text, sk)) { skills.push(sk); seen.add(key); }
  });
  return skills;
}

// Offline heuristic parse — used when no Groq key is set, or as a fallback
// when the LLM call fails.
function parseJdLocally(text) {
  // Split off a "good to have / nice to have / preferred / bonus" section so
  // those skills become optional rather than required.
  const gthRe = /(good to have|nice[- ]to[- ]have|preferred|preferable|desirable|bonus|added advantage|would be a plus|pluses|plus points|good to know)/i;
  let requiredText = text;
  let optionalText = '';
  const gth = text.match(gthRe);
  if (gth) {
    const startIdx = gth.index;
    let endIdx = text.length;
    const after = text.slice(startIdx + gth[0].length);
    // Stop the optional section at the next major heading.
    const nextHeading = after.match(/\n\s*(soft skills|education|qualifications?|responsibilit|about the|what you|benefits|perks|why join)/i);
    if (nextHeading) endIdx = startIdx + gth[0].length + nextHeading.index;
    optionalText = text.slice(startIdx, endIdx);
    requiredText = text.slice(0, startIdx) + ' ' + text.slice(endIdx);
  }

  const requiredSkills = extractSkillsFromText(requiredText);
  const requiredSet = new Set(requiredSkills.map(s => s.toLowerCase()));
  // Only skills that appear ONLY in the good-to-have section become optional.
  const optionalSkills = gth
    ? extractSkillsFromText(optionalText).filter(s => !requiredSet.has(s.toLowerCase()))
    : [];

  const locations = locationOptions.filter(loc => jdContainsTerm(text, loc));
  if (jdContainsTerm(text, 'Bangalore') && !locations.includes('Bengaluru')) locations.push('Bengaluru');

  const companies = companyOptions.filter(c => jdContainsTerm(text, c));

  const designations = designationOptions.filter(d => jdContainsTerm(text, d));
  const titleMatch = text.match(/job\s*title\s*:\s*(.+)/i);
  if (titleMatch) {
    const t = titleMatch[1].split(/[\n\r|(]/)[0].trim();
    if (t && !designations.some(d => d.toLowerCase() === t.toLowerCase())) designations.unshift(t);
  }

  let experienceIds = [];
  const range = text.match(/(\d{1,2})\s*(?:[-–—]|to)\s*(\d{1,2})\s*\+?\s*years?/i);
  const plus = text.match(/(\d{1,2})\s*\+\s*years?/i);
  const single = text.match(/(\d{1,2})\s*years?/i);
  if (range) experienceIds = mapExperienceRange(parseInt(range[1]), parseInt(range[2]));
  else if (plus) experienceIds = mapExperienceRange(parseInt(plus[1]), 99);
  else if (single) experienceIds = mapExperienceRange(parseInt(single[1]), parseInt(single[1]));

  const openToWork = /open to work|actively looking|immediate joiner|notice period/i.test(text);

  return {
    skills: requiredSkills.slice(0, 15),
    optionalSkills: optionalSkills.slice(0, 12),
    designations: [...new Set(designations)].slice(0, 6),
    locations: [...new Set(locations)],
    companies: [...new Set(companies)],
    experienceIds,
    openToWork
  };
}

// LLM parse via the existing Groq integration. Returns the same shape as
// parseJdLocally.
async function parseJdWithGroq(text, apiKey) {
  const model = localStorage.getItem('siliconPatternsGroqModel') || 'llama-3.3-70b-versatile';
  const system = `You extract structured LinkedIn sourcing filters from a job description.
Return ONLY a valid JSON object with this exact shape:
{
  "skills": string[],         // 5-12 REQUIRED / must-have technical skills (from "Required Skills", core responsibilities). Prefer canonical names from the list; add clearly-required ones not in it. NO soft skills.
  "optionalSkills": string[], // ONLY skills the JD lists as nice-to-have: sections like "Good to Have", "Nice to have", "Preferred", "Bonus", "Plus", "Desirable". If the JD has NO such section, return []. Never duplicate anything already in "skills".
  "designations": string[],   // 2-5 likely LinkedIn job titles for this role
  "locations": string[],      // city/region names, e.g. "Bengaluru" (use "Bengaluru" not "Bangalore")
  "companies": string[],      // only specific target employers explicitly named in the JD, else []
  "experienceIds": string[],  // subset of allowed experience bucket ids covering the required years
  "openToWork": boolean       // true ONLY if the JD explicitly wants active job seekers / immediate joiners
}
Allowed experienceIds: "1"=<1yr, "2"=1-2yr, "3"=3-5yr, "4"=6-10yr, "5"=10+yr.
Canonical skills: ${ASIC_SKILLS.join(', ')}.
Respond with JSON only, no prose or markdown.`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Job description:\n\n${text}` }
      ],
      temperature: 0.1,
      max_tokens: 1200,
      response_format: { type: 'json_object' }
    })
  });
  if (!res.ok) throw new Error(`Groq API error (${res.status})`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(content);
  const validExp = new Set(experienceOptions.map(o => o.value));
  const req = Array.isArray(parsed.skills) ? parsed.skills : [];
  const reqSet = new Set(req.map(s => String(s).toLowerCase()));
  return {
    skills: req,
    // Drop any optional skill that duplicates a required one.
    optionalSkills: (Array.isArray(parsed.optionalSkills) ? parsed.optionalSkills : []).filter(s => !reqSet.has(String(s).toLowerCase())),
    designations: Array.isArray(parsed.designations) ? parsed.designations : [],
    locations: Array.isArray(parsed.locations) ? parsed.locations : [],
    companies: Array.isArray(parsed.companies) ? parsed.companies : [],
    experienceIds: (Array.isArray(parsed.experienceIds) ? parsed.experienceIds : []).map(String).filter(id => validExp.has(id)),
    openToWork: typeof parsed.openToWork === 'boolean' ? parsed.openToWork : false
  };
}

// --- Local relevance scoring -------------------------------------------
// A cheap, offline 0-100 relevance score computed at retrieval time so the
// best-matching candidates float to the top before the (optional) AI Agent
// ever runs. Must-have skills dominate; nice-to-have skills, job title and
// location add bonuses. Only the filters the recruiter actually set count
// toward the score, so it normalises to a clean 0-100.
export function computeMatchScore(profile, requiredSkills = [], optionalSkills = [], targetDesignations = [], targetLocations = []) {
  const skillBlob = [
    safeExtractText(profile.headline),
    safeExtractText(profile.about || profile.summary),
    safeExtractText(profile.currentTitle || profile.jobTitle),
    extractSkillsList(profile),
    Array.isArray(profile.topSkills) ? profile.topSkills.join(' ') : safeExtractText(profile.topSkills),
    safeExtractText(profile.positions || profile.experience)
  ].filter(t => t && t !== 'N/A').join('  ');

  let earned = 0;
  let possible = 0;

  if (requiredSkills.length > 0) {
    possible += 55;
    const hits = requiredSkills.filter(s => jdContainsTerm(skillBlob, s)).length;
    earned += (hits / requiredSkills.length) * 55;
  }

  if (optionalSkills.length > 0) {
    possible += 20;
    const optHits = optionalSkills.filter(s => jdContainsTerm(skillBlob, s)).length;
    earned += (optHits / optionalSkills.length) * 20;
  }

  if (targetDesignations.length > 0) {
    possible += 15;
    const titleBlob = [
      safeExtractText(profile.headline),
      safeExtractText(profile.currentTitle || profile.jobTitle)
    ].join('  ');
    if (targetDesignations.some(d => jdContainsTerm(titleBlob, d))) earned += 15;
  }

  if (targetLocations.length > 0) {
    possible += 10;
    const locBlob = safeExtractText(profile.location);
    if (targetLocations.some(l => jdContainsTerm(locBlob, l))) earned += 10;
  }

  if (possible === 0) return 0;
  return Math.round((earned / possible) * 100);
}

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
          {/* Add-custom pinned to the TOP so it's always visible, even when the
              list of existing options is long. */}
          {allowCustom && inputValue.trim() && !options.some(o => (typeof o === 'object' ? o.label : o).toLowerCase() === inputValue.trim().toLowerCase()) && (
            <div
              onClick={() => {
                if (!selected.includes(inputValue.trim())) onChange([...selected, inputValue.trim()]);
                setInputValue('');
              }}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: 'var(--accent-fg)',
                backgroundColor: 'var(--accent)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px',
                position: 'sticky', top: 0, zIndex: 1
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Add “{inputValue.trim()}”
            </div>
          )}
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
          { label: 'Evaluation', path: '/agent', active: location.pathname === '/agent', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="15" x2="23" y2="15"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="15" x2="4" y2="15"></line></svg> },
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

function SearchPage({ masterLeads, setMasterLeads, supabaseUrl, supabaseKey }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [selectedSkills, setSelectedSkills] = useState([]); // must-have (filters the query)
  const [optionalSkills, setOptionalSkills] = useState([]); // nice-to-have (boosts ranking only)
  const [companies, setCompanies] = useState([]);
  const [location, setLocation] = useState([]);
  const [designation, setDesignation] = useState([]);
  const [experience, setExperience] = useState([]);
  // How selected skills combine in the query: 'any' = OR (broad recall),
  // 'all' = AND (strict — profile must mention every skill).
  const [skillMatchMode, setSkillMatchMode] = useState('any');
  const [maxItems, setMaxItems] = useState(100);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [apifyRunUrl, setApifyRunUrl] = useState(null);
  const [runInfo, setRunInfo] = useState(null); // { totalPages, totalItems, scraped } live progress
  const [aborting, setAborting] = useState(false);
  const runIdRef = useRef(null);
  const stopRequestedRef = useRef(false);
  const [latestRunResults, setLatestRunResults] = useState([]);
  const [skillFilter, setSkillFilter] = useState('');
  const [customSkill, setCustomSkill] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Job Description autofill
  const [jdText, setJdText] = useState('');
  const [jdParsing, setJdParsing] = useState(false);
  const [jdMessage, setJdMessage] = useState(null); // { type: 'info'|'error', text }
  const [showJdPanel, setShowJdPanel] = useState(false);
  const jdFileRef = useRef(null);

  // Presets (scoped to the logged-in account)
  const accountId = (currentUser?.email || 'anon').toLowerCase();
  const presetKey = `siliconPatternsPresets_${accountId}`;
  const lastSearchKey = `siliconPatternsLastSearch_${accountId}`;
  const pageStateKey = `siliconPatternsSearchPage_${accountId}`;
  const [presets, setPresets] = useState([]);
  const [lastSearch, setLastSearch] = useState(null);
  const [presetName, setPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);
  // Page-advance: which LinkedIn search page the next run of the CURRENT
  // filter set will pull, so each run fetches fresh people instead of
  // re-scraping (and re-paying for) the same first 25. `pageInput` is the
  // visible, editable page the next run will scrape.
  const [pageInput, setPageInput] = useState(1);
  const [lastScrapedPage, setLastScrapedPage] = useState(null);
  const [pageSyncing, setPageSyncing] = useState(false);
  // When Supabase is connected the page cursor is shared across the whole
  // team; otherwise it falls back to per-browser localStorage.
  const globalCursor = !!(supabaseUrl && supabaseKey);

  // A stable fingerprint of the actor query inputs. When it changes, the
  // page counter resets to 1.
  const getQuerySignature = () => JSON.stringify({
    s: [...selectedSkills].sort(),
    d: [...designation].sort(),
    e: [...experience].sort(),
    l: [...location].sort(),
    c: [...companies].sort(),
    m: skillMatchMode
  });

  useEffect(() => {
    try { setPresets(JSON.parse(localStorage.getItem(presetKey) || '[]')); } catch { setPresets([]); }
    try {
      const ls = localStorage.getItem(lastSearchKey);
      setLastSearch(ls ? JSON.parse(ls) : null);
    } catch { setLastSearch(null); }
  }, [presetKey, lastSearchKey]);

  // Read the stored page for a signature from localStorage (local-mode / fallback).
  const readLocalPageForSig = (sig) => {
    try {
      const stored = JSON.parse(localStorage.getItem(pageStateKey) || '{}');
      if (stored.signature === sig && stored.nextPage) return stored.nextPage;
    } catch { /* default */ }
    return 1;
  };

  // Persist the page for a signature — to the shared Supabase cursor when
  // connected, otherwise to localStorage.
  const persistPage = async (page, sig) => {
    const p = Math.max(1, parseInt(page, 10) || 1);
    if (globalCursor) {
      try {
        const { setSearchPage } = await import('./supabase.js');
        await setSearchPage(supabaseUrl, supabaseKey, sig, p);
        return;
      } catch (e) {
        console.error('Failed to sync shared page, using local fallback:', e);
      }
    }
    try { localStorage.setItem(pageStateKey, JSON.stringify({ signature: sig, nextPage: p })); } catch { /* ignore */ }
  };

  // Load the current page whenever the filters (signature) change. In global
  // mode this peeks the shared cursor so everyone sees the same number.
  useEffect(() => {
    let cancelled = false;
    const sig = getQuerySignature();
    setLastScrapedPage(null);
    if (globalCursor) {
      setPageSyncing(true);
      import('./supabase.js')
        .then(({ peekSearchPage }) => peekSearchPage(supabaseUrl, supabaseKey, sig))
        .then(p => { if (!cancelled) setPageInput(p); })
        .catch(() => { if (!cancelled) setPageInput(readLocalPageForSig(sig)); })
        .finally(() => { if (!cancelled) setPageSyncing(false); });
    } else {
      setPageInput(readLocalPageForSig(sig));
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSkills, designation, experience, location, companies, skillMatchMode, globalCursor, supabaseUrl, supabaseKey]);

  // User manually typed a page number — clamp and persist it.
  const commitPageInput = (value) => {
    const p = Math.max(1, parseInt(value, 10) || 1);
    setPageInput(p);
    persistPage(p, getQuerySignature());
  };

  const resetSearchPage = () => commitPageInput(1);

  const availableSkills = selectedCategory === 'All' ? ASIC_SKILLS : ASIC_SKILLS_CATEGORIZED[selectedCategory];
  const filteredSkills = availableSkills.filter(s => s.toLowerCase().includes(skillFilter.toLowerCase()));

  const applyParsedJd = (p) => {
    const clean = (arr) => [...new Set((arr || []).map(s => String(s).trim()).filter(Boolean))];
    const required = clean(p.skills);
    setSelectedSkills(required);
    // Only fill nice-to-have skills when the JD actually spells out a
    // good-to-have section — otherwise leave the field as the user had it.
    const optional = clean(p.optionalSkills).filter(s => !required.some(r => r.toLowerCase() === s.toLowerCase()));
    if (optional.length > 0) setOptionalSkills(optional);
    setDesignation(clean(p.designations));
    setLocation(clean(p.locations));
    setCompanies(clean(p.companies));
    const validExp = new Set(experienceOptions.map(o => o.value));
    setExperience((p.experienceIds || []).map(String).filter(id => validExp.has(id)));
    return required.length + clean(p.designations).length;
  };

  const handleParseJd = async (overrideText) => {
    const text = (typeof overrideText === 'string' ? overrideText : jdText);
    if (!text.trim()) { setJdMessage({ type: 'error', text: 'Paste or upload a job description first.' }); return; }
    setJdParsing(true);
    setJdMessage(null);
    const apiKey = (localStorage.getItem('siliconPatternsGroqApiKey') || import.meta.env.VITE_GROQ_API_TOKEN || '').trim();
    try {
      let parsed;
      if (apiKey) {
        try {
          parsed = await parseJdWithGroq(text, apiKey);
          applyParsedJd(parsed);
          setJdMessage({ type: 'info', text: 'Parameters auto-filled from the job description. Review and adjust before searching.' });
        } catch (llmErr) {
          console.error('Groq JD parse failed, falling back to local parser:', llmErr);
          parsed = parseJdLocally(text);
          applyParsedJd(parsed);
          setJdMessage({ type: 'info', text: 'AI parse unavailable — used keyword matching instead. Please review the filled parameters.' });
        }
      } else {
        parsed = parseJdLocally(text);
        applyParsedJd(parsed);
        setJdMessage({ type: 'info', text: 'Filled via keyword matching (add a Groq API key in Settings for smarter parsing).' });
      }
    } catch (err) {
      console.error(err);
      setJdMessage({ type: 'error', text: `Could not parse the job description: ${err.message}` });
    } finally {
      setJdParsing(false);
    }
  };

  const handleJdFile = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setShowJdPanel(true);
    setJdParsing(true);
    setJdMessage({ type: 'info', text: `Reading ${file.name}…` });
    try {
      const { extractJobDescriptionText } = await import('./jdExtract.js');
      const text = (await extractJobDescriptionText(file) || '').trim();
      if (!text) throw new Error('No readable text found in that file.');
      setJdText(text);
      setJdParsing(false);
      // Auto-parse straight away using the freshly extracted text.
      await handleParseJd(text);
    } catch (err) {
      console.error(err);
      setJdParsing(false);
      setJdMessage({ type: 'error', text: err.message || 'Could not read that file.' });
    }
  };

  const getCurrentParams = () => ({
    selectedSkills, optionalSkills, designation, experience, location, companies, maxItems, skillMatchMode
  });

  const applyParams = (p) => {
    if (!p) return;
    setSelectedSkills(p.selectedSkills || []);
    setOptionalSkills(p.optionalSkills || []);
    setDesignation(p.designation || []);
    setExperience(p.experience || []);
    setLocation(p.location || []);
    setCompanies(p.companies || []);
    if (p.maxItems) setMaxItems(p.maxItems);
    if (p.skillMatchMode) setSkillMatchMode(p.skillMatchMode);
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    if (selectedSkills.length === 0 && designation.length === 0) {
      alert('Add some skills or designations before saving a preset.');
      return;
    }
    const entry = { name, params: getCurrentParams(), savedAt: new Date().toISOString() };
    const next = [entry, ...presets.filter(p => p.name.toLowerCase() !== name.toLowerCase())].slice(0, 20);
    setPresets(next);
    localStorage.setItem(presetKey, JSON.stringify(next));
    setPresetName('');
    setShowSavePreset(false);
  };

  const deletePreset = (name) => {
    const next = presets.filter(p => p.name !== name);
    setPresets(next);
    localStorage.setItem(presetKey, JSON.stringify(next));
  };

  const handleAddCustomSkill = () => {
    if (customSkill.trim() && !selectedSkills.includes(customSkill.trim())) {
      setSelectedSkills(prev => [...prev, customSkill.trim()]);
      setCustomSkill('');
    }
  };

  const toggleSkill = (skill) => {
    setSelectedSkills(prev => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]);
  };

  // Gracefully stop the current run — keeps whatever was scraped so far.
  const handleStopSearch = async () => {
    if (!runIdRef.current || stopRequestedRef.current) return;
    stopRequestedRef.current = true;
    setAborting(true);
    setStatus('Stopping run — keeping everything scraped so far…');
    try {
      const token = localStorage.getItem('siliconPatternsApifyKey') || DEFAULT_APIFY_TOKEN;
      await fetch(`https://api.apify.com/v2/actor-runs/${runIdRef.current}/abort?gracefully=1&token=${token}`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to abort run:', err);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (selectedSkills.length === 0) { alert("Please select at least one core skill."); return; }
    setLoading(true);
    setLatestRunResults([]);
    setApifyRunUrl(null);
    setRunInfo(null);
    setAborting(false);
    stopRequestedRef.current = false;
    runIdRef.current = null;
    setStatus('Initiating search protocol...');

    try {
      const expandSkillForQuery = (skill) => {
        const matchGen = skill.match(/^(.+?)\s*Gen\s*(\d+)$/i);
        if (matchGen) {
          const base = matchGen[1].trim();
          const gen = matchGen[2].trim();
          return `("${skill}" OR "${base} Gen ${gen}" OR "${base} Gen${gen}" OR "${base} ${gen}.0" OR "${base} ${gen}")`;
        }
        return `"${skill}"`;
      };

      // HIGH-RECALL retrieval: match ANY selected skill (OR), then let the
      // scoring/ranking layer surface the best fits. ANDing every skill as an
      // exact phrase is what collapsed results down to a handful of profiles
      // (and kept returning the same already-saved people).
      // 'any' → OR (broad recall), 'all' → AND (strict, must mention every skill).
      const joiner = skillMatchMode === 'all' ? ' AND ' : ' OR ';
      const skillQuery = selectedSkills.map(expandSkillForQuery).join(joiner);
      const finalQuery = selectedSkills.length > 1 ? `(${skillQuery})` : skillQuery;

      // Page-advance: pull the page shown in the (editable) page selector so
      // each run brings fresh people instead of re-scraping the same first 25.
      // The selector is backed by the shared cursor in global mode.
      const querySignature = getQuerySignature();
      const useGlobalCursor = globalCursor;
      const startPage = Math.max(1, parseInt(pageInput, 10) || 1);

      const searchInput = {
        searchQuery: finalQuery,
        ...(location.length > 0 && { locations: location }),
        ...(designation.length > 0 && { currentJobTitles: designation }),
        // Use the actor's dedicated company field instead of poisoning the
        // keyword query with more AND clauses.
        ...(companies.length > 0 && { currentCompanies: companies.map(c => c.trim()) }),
        ...(experience.length > 0 && { yearsOfExperienceIds: experience }),
        profileScraperMode: "Full",
        startPage: startPage,
        maxItems: maxItems
      };
      // NOTE: "Open to work" is a profile badge, not reliable searchable text,
      // so it is NOT added to searchQuery (that AND clause was killing results).
      // It is applied purely as a post-fetch filter via isCandidateOpenToWork below.

      const currentApifyToken = localStorage.getItem('siliconPatternsApifyKey') || DEFAULT_APIFY_TOKEN;
      if (!currentApifyToken) { alert("Please provide an Apify API Key in Settings."); setLoading(false); return; }

      // Remember this parameter set for the logged-in account so it can be
      // one-click restored later.
      try {
        const lp = { ...getCurrentParams(), savedAt: new Date().toISOString() };
        localStorage.setItem(lastSearchKey, JSON.stringify(lp));
        setLastSearch(lp);
      } catch { /* non-fatal */ }

      setStatus('Contacting Apify servers and launching actor...');
      const runResponse = await fetch(`https://api.apify.com/v2/acts/${ACTOR_NAME}/runs?token=${currentApifyToken}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchInput)
      });

      if (!runResponse.ok) throw new Error('Failed to run search process.');
      const runJson = await runResponse.json();
      const runId = runJson.data.id;
      const datasetId = runJson.data.defaultDatasetId;
      runIdRef.current = runId;

      setApifyRunUrl(`https://console.apify.com/actors/runs/${runId}`);
      setStatus('Actor launched! Scraping deep profile data... (Please wait)');

      // Pull the run log and extract the actor's "Total pages / Total items"
      // line plus how many profiles have been scraped so far, for live progress.
      const refreshRunInfo = async () => {
        try {
          const logRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/log?token=${currentApifyToken}`);
          if (!logRes.ok) return;
          const logText = await logRes.text();
          const m = logText.match(/Total pages:\s*(\d+)\.\s*Total items:\s*(\d+)/i);
          const scraped = (logText.match(/Scraped profile/g) || []).length;
          setRunInfo({
            totalPages: m ? parseInt(m[1], 10) : null,
            totalItems: m ? parseInt(m[2], 10) : null,
            scraped
          });
        } catch { /* progress is best-effort */ }
      };

      let runStatus = 'RUNNING';
      let wasAborted = false;
      while (['RUNNING', 'READY', 'ABORTING'].includes(runStatus)) {
        await new Promise(resolve => setTimeout(resolve, 4000));
        await refreshRunInfo();
        const statusResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${currentApifyToken}`);
        const statusJson = await statusResponse.json();
        runStatus = statusJson.data.status;
        if (runStatus === 'SUCCEEDED') break;
        if (runStatus === 'ABORTED') { wasAborted = true; break; }
        if (['FAILED', 'TIMED-OUT'].includes(runStatus)) throw new Error(`Execution terminated: ${runStatus}`);
      }

      setStatus(wasAborted
        ? 'Run stopped — collecting the profiles scraped before the stop…'
        : 'Extracting dataset and running deduplication algorithm...');
      const datasetResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${currentApifyToken}`);
      if (!datasetResponse.ok) throw new Error('Failed to pull final data array.');
      let profiles = await datasetResponse.json();
      if (!Array.isArray(profiles)) profiles = [];
      const totalScraped = profiles.length;

      if (totalScraped === 0) {
        // Ran out of results for this query — reset the page so the next run
        // (by anyone) starts over from page 1.
        setPageInput(1);
        await persistPage(1, querySignature);
        setLastScrapedPage(null);
        setStatus(startPage > 1
          ? `No more results — reached the end of this search (page ${startPage} was empty). Page reset to 1.`
          : 'The scrape returned 0 profiles for these parameters. Try broadening the skills/titles or removing filters.');
        setLoading(false);
        return;
      }

      // This page had results — advance the (shared) page past however many
      // pages we actually pulled (maxItems can span multiple 25-profile pages),
      // so the next run continues with fresh people instead of overlapping.
      setLastScrapedPage(startPage);
      const pagesConsumed = Math.max(1, Math.ceil(totalScraped / 25));
      const advancedPage = startPage + pagesConsumed;
      setPageInput(advancedPage);
      await persistPage(advancedPage, querySignature);

      // Every scraped profile is kept (you paid to scrape them) and tagged
      // with its open-to-work status. Filter to open-to-work in the Candidates
      // page whenever you want — no need to discard people at scrape time.
      const otwCount = profiles.filter(p => isCandidateOpenToWork(p)).length;
      const openToWorkNote = otwCount > 0 ? ` (${otwCount} flagged Open to Work)` : '';

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
            topSkills: profile.topSkills,
            positions: profile.positions || profile.experience,
            educations: profile.educations || profile.education,
            linkedinUrl: profile.linkedinUrl || profile.url,
            url: profile.url,
            // harvestapi returns the badge as `openToWork`; keep the legacy
            // key populated with the real value.
            isOpenToWork: profile.openToWork ?? profile.isOpenToWork ?? false,
            matchScore: computeMatchScore(profile, selectedSkills, optionalSkills, designation, location),
            status: 'sourced',
            assignedRecruiterEmail: currentUser?.email || 'dev@siliconpatterns.com',
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
        setStatus(`Search complete — all ${profiles.length} matching candidates are already in your Master Database.${openToWorkNote}`);
        setLoading(false);
        return;
      }

      // Log sourcing activities to Supabase if connected
      const dbUrl = supabaseUrl || localStorage.getItem('siliconPatternsSupabaseUrl');
      const dbKey = supabaseKey || localStorage.getItem('siliconPatternsSupabaseKey');
      if (dbUrl && dbKey) {
        try {
          const { logRecruiterActivity } = await import('./supabase.js');
          const recruiterEmail = currentUser?.email || 'dev@siliconpatterns.com';
          
          for (const p of newUniqueProfiles) {
            let skillArray = [];
            if (p.skills) {
              if (Array.isArray(p.skills)) {
                skillArray = p.skills.map(s => typeof s === 'string' ? s : (s.name || s.title || '')).filter(Boolean);
              } else {
                skillArray = String(p.skills).split(',').map(s => s.trim()).filter(Boolean);
              }
            }

            await logRecruiterActivity(dbUrl, dbKey, {
              recruiterEmail,
              candidateLinkedinUrl: p.linkedinUrl || p.url,
              candidateName: `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Candidate',
              actionType: 'sourced',
              skills: skillArray
            });
          }
        } catch (activityError) {
          console.error("Failed to log activity:", activityError);
        }
      }

      // Prefer the AI Agent score once it exists; otherwise rank by the local
      // relevance score computed at retrieval.
      const getEffectiveScore = (p) => {
        if (p.agentScore !== undefined && p.agentScore !== null) return p.agentScore;
        if (p.matchScore !== undefined && p.matchScore !== null) return p.matchScore;
        return 0;
      };
      newUniqueProfiles.sort((a, b) => getEffectiveScore(b) - getEffectiveScore(a));
      setLatestRunResults(newUniqueProfiles);

      const updatedMaster = [...masterLeads, ...newUniqueProfiles];
      updatedMaster.sort((a, b) => getEffectiveScore(b) - getEffectiveScore(a));
      setMasterLeads(updatedMaster);

      const stoppedNote = wasAborted ? ' (run stopped early — partial results kept)' : '';
      setStatus(`Found ${profiles.length} profiles${stoppedNote}. Added ${newUniqueProfiles.length} NEW candidates to Master Database.${openToWorkNote}`);
    } catch (error) {
      console.error(error);
      setStatus(`System Error: ${error.message}`);
    } finally {
      setLoading(false);
      setAborting(false);
      setRunInfo(null);
      runIdRef.current = null;
      stopRequestedRef.current = false;
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

        {/* --- Auto-fill from Job Description --- */}
        <div style={{ marginBottom: '20px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-surface)', overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setShowJdPanel(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-primary)', fontSize: '13px', fontWeight: '600'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
              Auto-fill from Job Description
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', transform: showJdPanel ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
          </button>

          {showJdPanel && (
            <div style={{ padding: '0 16px 16px' }}>
              <textarea
                value={jdText}
                onChange={e => setJdText(e.target.value)}
                placeholder="Paste the full job description here — title, location, experience, required skills — and we'll fill in the search parameters below."
                rows={7}
                style={{ ...inputStyle, resize: 'vertical', fontSize: '13px', lineHeight: 1.5, minHeight: '120px' }}
              />
              <input
                ref={jdFileRef}
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={handleJdFile}
                style={{ display: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => handleParseJd()}
                  disabled={jdParsing}
                  style={{
                    padding: '8px 16px', backgroundColor: jdParsing ? 'var(--border-color)' : 'var(--accent)',
                    color: 'var(--accent-fg)', border: 'none', borderRadius: '6px',
                    cursor: jdParsing ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600',
                    display: 'flex', alignItems: 'center', gap: '8px'
                  }}
                >
                  {jdParsing ? 'Analyzing…' : 'Auto-fill parameters'}
                </button>
                <button
                  type="button"
                  onClick={() => jdFileRef.current?.click()}
                  disabled={jdParsing}
                  title="Upload a job description as PDF, DOCX or TXT"
                  style={{
                    padding: '8px 14px', background: 'transparent', color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)', borderRadius: '6px',
                    cursor: jdParsing ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '500',
                    display: 'flex', alignItems: 'center', gap: '8px'
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                  Upload PDF / DOCX
                </button>
                {jdText && (
                  <button type="button" onClick={() => { setJdText(''); setJdMessage(null); }} style={{
                    padding: '8px 12px', background: 'transparent', color: 'var(--text-secondary)',
                    border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
                  }}>Clear</button>
                )}
              </div>
              {jdMessage && (
                <p style={{
                  margin: '10px 0 0', fontSize: '12px',
                  color: jdMessage.type === 'error' ? '#f87171' : 'var(--text-secondary)'
                }}>{jdMessage.text}</p>
              )}
            </div>
          )}
        </div>

        {/* --- Presets & recent search (per account) --- */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ ...labelStyle, marginBottom: 0 }}>Saved Presets</span>
            {!showSavePreset ? (
              <button type="button" onClick={() => setShowSavePreset(true)} style={{
                padding: '5px 12px', background: 'var(--bg-surface)', color: 'var(--text-primary)',
                border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                Save current
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="text"
                  autoFocus
                  value={presetName}
                  onChange={e => setPresetName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); savePreset(); } if (e.key === 'Escape') { setShowSavePreset(false); setPresetName(''); } }}
                  placeholder="Preset name…"
                  style={{ ...inputStyle, width: '160px', padding: '6px 10px', fontSize: '12px' }}
                />
                <button type="button" onClick={savePreset} style={{
                  padding: '6px 12px', background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none',
                  borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600'
                }}>Save</button>
                <button type="button" onClick={() => { setShowSavePreset(false); setPresetName(''); }} style={{
                  padding: '6px 10px', background: 'transparent', color: 'var(--text-secondary)',
                  border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
                }}>Cancel</button>
              </div>
            )}
          </div>

          {(presets.length > 0 || lastSearch) ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {lastSearch && (
                <button type="button" onClick={() => applyParams(lastSearch)} title="Restore the parameters from your last search" style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '500', cursor: 'pointer',
                  border: '1px dashed var(--accent)', background: 'rgba(0, 229, 255, 0.08)', color: 'var(--accent)'
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5"></path><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"></path></svg>
                  Restore last search
                </button>
              )}
              {presets.map(preset => (
                <span key={preset.name} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '6px 8px 6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '500',
                  border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)'
                }}>
                  <button type="button" onClick={() => applyParams(preset.params)} title={`Load preset "${preset.name}"`} style={{
                    background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '12px', fontWeight: '500', padding: 0
                  }}>{preset.name}</button>
                  <span
                    onClick={() => deletePreset(preset.name)}
                    title="Delete preset"
                    style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 'bold', lineHeight: 1 }}
                  >×</span>
                </span>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              No presets yet. Configure the filters below and click “Save current” to reuse them later.
            </p>
          )}
        </div>

        <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Must-have Skills</label>
              {/* Skill match mode: how selected skills combine in the query */}
              <div style={{ display: 'inline-flex', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                {[
                  { key: 'any', label: 'Match any', hint: 'Broad — profile mentions at least one skill (OR). More results.' },
                  { key: 'all', label: 'Match all', hint: 'Strict — profile must mention every skill (AND). Fewer, closer matches.' }
                ].map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    title={opt.hint}
                    onClick={() => setSkillMatchMode(opt.key)}
                    style={{
                      padding: '5px 12px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: 'none',
                      backgroundColor: skillMatchMode === opt.key ? 'var(--accent)' : 'transparent',
                      color: skillMatchMode === opt.key ? 'var(--accent-fg)' : 'var(--text-secondary)'
                    }}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              {skillMatchMode === 'all'
                ? 'Strict: candidates must mention every selected skill. Use for tight shortlists.'
                : 'Broad: candidates matching any selected skill are returned, ranked by relevance.'}
            </p>

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
                <button type="button" onClick={handleAddCustomSkill} title="Add custom skill" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '36px', height: '36px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', border: 'none',
                  borderRadius: '6px', cursor: 'pointer'
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
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

          <div>
            <label style={labelStyle}>Nice-to-have Skills <span style={{ textTransform: 'none', fontWeight: '400', color: 'var(--text-secondary)' }}>(optional — boosts ranking, never excludes)</span></label>
            <TagSelect
              options={ASIC_SKILLS}
              selected={optionalSkills}
              onChange={setOptionalSkills}
              placeholder="e.g. PCIe, SignalTap, Python — bonus points, not required"
            />
            <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'var(--text-secondary)' }}>
              Candidates who also have these rank higher (higher Match %), but people missing them are still returned.
            </p>
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Every scraped candidate is saved with their Open-to-Work status — filter to them anytime in the Candidate Database.
            </span>
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

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)', fontWeight: '600' }}>
                Search page
                <input
                  type="number"
                  min="1"
                  value={pageInput}
                  onChange={e => setPageInput(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1))}
                  onBlur={e => commitPageInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitPageInput(e.currentTarget.value); } }}
                  title="The LinkedIn results page the next run will scrape (each page ≈ 25 people). Edit to jump to a specific page."
                  style={{
                    width: '58px', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', fontSize: '13px', textAlign: 'center'
                  }}
                />
              </span>
              <span style={{ opacity: 0.75, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                {globalCursor ? (
                  <>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: pageSyncing ? '#eab308' : '#10b981', display: 'inline-block' }} />
                    {pageSyncing ? 'syncing…' : 'shared with your team'}
                  </>
                ) : 'this device only'}
                {lastScrapedPage ? ` · last scraped page ${lastScrapedPage}` : ''}
              </span>
              {pageInput > 1 && (
                <button type="button" onClick={resetSearchPage} title="Jump back to page 1" style={{
                  background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
                  borderRadius: '6px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer'
                }}>Reset to 1</button>
              )}
            </div>
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
              <span style={{ flex: 1 }}>{status}</span>
              {loading && runIdRef.current && (
                <button
                  type="button"
                  onClick={handleStopSearch}
                  disabled={aborting}
                  title="Stop the run now and keep whatever was scraped so far"
                  style={{
                    padding: '5px 12px', fontSize: '12px', fontWeight: '600', cursor: aborting ? 'not-allowed' : 'pointer',
                    borderRadius: '6px', border: '1px solid rgba(248, 113, 113, 0.4)',
                    backgroundColor: 'rgba(220, 38, 38, 0.12)', color: '#f87171', flexShrink: 0
                  }}
                >{aborting ? 'Stopping…' : 'Stop & keep'}</button>
              )}
            </div>
            {loading && runInfo && (runInfo.totalItems != null || runInfo.scraped > 0) && (
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                {runInfo.totalItems != null && (
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Search has <strong style={{ color: 'var(--text-primary)' }}>{runInfo.totalItems}</strong> people across <strong style={{ color: 'var(--text-primary)' }}>{runInfo.totalPages}</strong> pages
                  </span>
                )}
                <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: '600' }}>
                  · scraped {runInfo.scraped}{maxItems ? ` / ${maxItems}` : ''}
                </span>
              </div>
            )}
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
                    {isCandidateOpenToWork(p) && (
                      <span style={{
                        backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981',
                        padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', border: '1px solid rgba(16, 185, 129, 0.3)'
                      }}>Open to Work</span>
                    )}
                    {p.agentScore !== undefined && p.agentScore !== null ? (
                      <span style={{
                        backgroundColor: 'rgba(0, 229, 255, 0.15)',
                        color: 'var(--accent)',
                        padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '500', border: '1px solid rgba(0, 229, 255, 0.3)'
                      }}>Score: {p.agentScore}</span>
                    ) : (p.matchScore !== undefined && p.matchScore !== null && (
                      <span title="Local relevance score (skills, title & location match)" style={{
                        backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)',
                        padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '500', border: '1px solid var(--border-color)'
                      }}>Match: {p.matchScore}%</span>
                    ))}
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
    const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    const dbModeStored = localStorage.getItem('siliconPatternsDbMode');

    const dbUrl = localStorage.getItem('siliconPatternsSupabaseUrl') || envUrl;
    const dbKey = localStorage.getItem('siliconPatternsSupabaseKey') || envKey;
    const dbMode = (envUrl && envKey) || (dbUrl && dbKey && dbModeStored !== 'local');

    setUseSupabase(!!dbMode);
    setSupabaseUrl(dbUrl);
    setSupabaseKey(dbKey);

    setInputUseSupabase(!!dbMode);
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
                    <Route path="/search" element={<SearchPage masterLeads={masterLeads} setMasterLeads={syncMasterLeads} supabaseUrl={supabaseUrl} supabaseKey={supabaseKey} />} />
                    <Route path="/candidates" element={<CandidatesPage masterLeads={masterLeads} setMasterLeads={syncMasterLeads} />} />
                    <Route path="/agent" element={<AIAgentPage masterLeads={masterLeads} setMasterLeads={syncMasterLeads} />} />
                    <Route path="/pipeline" element={<PipelinePage masterLeads={masterLeads} setMasterLeads={syncMasterLeads} supabaseUrl={supabaseUrl} supabaseKey={supabaseKey} />} />
                    <Route path="/analytics" element={<AnalyticsPage masterLeads={masterLeads} />} />
                    <Route path="/admin" element={<AdminPage masterLeads={masterLeads} supabaseUrl={supabaseUrl} supabaseKey={supabaseKey} />} />
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
  );
}
