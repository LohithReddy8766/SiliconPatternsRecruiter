import React, { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { ASIC_SKILLS, ASIC_SKILLS_CATEGORIZED } from './skills.js';

const STAGE_BADGES = {
  sourced: { label: 'Sourced', bg: 'var(--bg-surface)', text: 'var(--text-secondary)', border: 'var(--border-color)' },
  reached_out: { label: 'Reached Out', bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: 'rgba(96, 165, 250, 0.3)' },
  interviewing: { label: 'Interviewing', bg: 'rgba(217, 119, 6, 0.15)', text: '#fbbf24', border: 'rgba(251, 191, 36, 0.3)' },
  offer: { label: 'Offer Extended', bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: 'rgba(192, 132, 252, 0.3)' },
  hired: { label: 'Hired', bg: 'rgba(22, 163, 74, 0.15)', text: '#4ade80', border: 'rgba(74, 222, 128, 0.3)' },
  rejected: { label: 'Rejected', bg: 'rgba(220, 38, 38, 0.15)', text: '#f87171', border: 'rgba(248, 113, 113, 0.3)' }
};

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
  if (!profile.skills) return '';
  if (Array.isArray(profile.skills)) {
    return profile.skills.map(s => typeof s === 'string' ? s : (s.name || s.title || '')).filter(Boolean).join(', ');
  }
  return safeExtractText(profile.skills).replace(/[\r\n,"]/g, ' ');
}

function getScoreColor(score) {
  if (score >= 70) return { bg: 'rgba(22, 163, 74, 0.15)', text: '#4ade80', border: 'rgba(74, 222, 128, 0.3)' };
  if (score >= 40) return { bg: 'rgba(217, 119, 6, 0.15)', text: '#fbbf24', border: 'rgba(251, 191, 36, 0.3)' };
  return { bg: 'var(--bg-main)', text: 'var(--text-secondary)', border: 'var(--border-color)' };
}

function CandidateCard({ profile, onRemove, isHighlighted }) {
  const [expanded, setExpanded] = useState(isHighlighted || false);
  const name = `${safeExtractText(profile.firstName)} ${safeExtractText(profile.lastName)}`.trim();
  const title = safeExtractText(profile.currentTitle || profile.jobTitle || profile.headline);
  const location = safeExtractText(profile.location).split(',')[0];
  const skills = extractSkillsList(profile);
  const url = safeExtractText(profile.linkedinUrl || profile.url);
  const about = safeExtractText(profile.about || profile.summary);
  const scoreColors = getScoreColor(profile.matchScore);

  let experience = '';
  if (profile.positions && Array.isArray(profile.positions)) {
    experience = profile.positions.slice(0, 3).map(e => `${e.title || 'Role'} @ ${e.companyName || 'Co'}`).join(' · ');
  } else if (profile.experience && Array.isArray(profile.experience)) {
    experience = profile.experience.slice(0, 3).map(e => `${e.title || 'Role'} @ ${e.company || 'Co'}`).join(' · ');
  }

  let education = '';
  if (profile.educations && Array.isArray(profile.educations)) {
    education = profile.educations.slice(0, 2).map(e => `${e.degreeName || 'Degree'} · ${e.schoolName || 'Institution'}`).join(' | ');
  } else if (profile.education && Array.isArray(profile.education)) {
    education = profile.education.slice(0, 2).map(e => `${e.degreeName || 'Degree'} · ${e.schoolName || 'Institution'}`).join(' | ');
  }

  return (
    <div style={{
      backgroundColor: isHighlighted ? 'var(--bg-surface-hover)' : 'var(--bg-surface)',
      border: isHighlighted ? '2px solid var(--accent)' : '1px solid var(--border-color)',
      borderRadius: '10px',
      overflow: 'hidden',
      transition: 'box-shadow 0.15s ease',
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* Card Header */}
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          {/* Avatar + Name */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
            <div style={{
              width: '40px', height: '40px', flexShrink: 0,
              backgroundColor: 'var(--accent)', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#000', fontWeight: '700', fontSize: '14px',
            }}>
              {(safeExtractText(profile.firstName)[0] || '?').toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>{name}</span>
                <span style={{ 
                  fontSize: '10px', 
                  fontWeight: '600', 
                  backgroundColor: STAGE_BADGES[profile.status || 'sourced'].bg, 
                  color: STAGE_BADGES[profile.status || 'sourced'].text, 
                  border: `1px solid ${STAGE_BADGES[profile.status || 'sourced'].border}`,
                  padding: '2px 7px', 
                  borderRadius: '10px' 
                }}>
                  {STAGE_BADGES[profile.status || 'sourced'].label}
                </span>
                {(safeExtractText(profile.headline) + ' ' + title).toLowerCase().includes('open to work') && (
                  <span style={{ fontSize: '10px', fontWeight: '600', color: '#4ade80', backgroundColor: 'rgba(22, 163, 74, 0.15)', padding: '2px 7px', borderRadius: '10px', border: '1px solid rgba(74, 222, 128, 0.3)' }}>
                    OPEN TO WORK
                  </span>
                )}
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>📍 {location}</p>
            </div>
          </div>

          {/* Score + Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <div style={{
              backgroundColor: scoreColors.bg, color: scoreColors.text,
              border: `1px solid ${scoreColors.border}`,
              borderRadius: '6px', padding: '4px 10px',
              fontSize: '13px', fontWeight: '800', letterSpacing: '-0.02em',
              display: 'flex', alignItems: 'center', gap: '4px'
            }} title={profile.agentScore ? "AI Agent Screened Score" : "Heuristic Score"}>
              {profile.agentScore && <span style={{ fontSize: '12px' }}>🤖</span>}
              <span>{profile.matchScore}</span>
            </div>
            {url && url !== 'N/A' && (
              <a href={url} target="_blank" rel="noopener noreferrer" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '30px', height: '30px',
                backgroundColor: 'rgba(0, 229, 255, 0.1)', borderRadius: '6px', border: '1px solid rgba(0, 229, 255, 0.3)',
                color: 'var(--accent)', fontSize: '12px', fontWeight: '700',
                textDecoration: 'none', flexShrink: 0,
              }}>in</a>
            )}
            <button
              onClick={() => setExpanded(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '30px', height: '30px',
                backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}
            >
              {expanded ? '▲' : '▼'}
            </button>
            <button
              onClick={() => onRemove(profile)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '30px', height: '30px',
                backgroundColor: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(248, 113, 113, 0.3)',
                borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: '#f87171',
              }}
              title="Remove from database"
            >×</button>
          </div>
        </div>

        {/* Skills chips */}
        {skills && skills !== 'N/A' && skills !== '' && (
          <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {skills.split(', ').slice(0, 8).map((skill, i) => (
              <span key={i} style={{
                padding: '2px 8px', borderRadius: '4px',
                fontSize: '11px', fontWeight: '500',
                backgroundColor: ASIC_SKILLS.includes(skill) ? 'rgba(0, 229, 255, 0.1)' : 'var(--bg-main)',
                color: ASIC_SKILLS.includes(skill) ? 'var(--accent)' : 'var(--text-secondary)',
                border: ASIC_SKILLS.includes(skill) ? '1px solid rgba(0, 229, 255, 0.3)' : '1px solid var(--border-color)',
              }}>{skill}</span>
            ))}
            {skills.split(', ').length > 8 && (
              <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
                +{skills.split(', ').length - 8} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-color)', padding: '16px 20px', backgroundColor: 'var(--bg-main)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {about && about !== 'N/A' && (
            <div>
              <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>About</p>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6 }}>{about.substring(0, 300)}{about.length > 300 ? '...' : ''}</p>
            </div>
          )}
          {experience && (
            <div>
              <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Experience</p>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6 }}>{experience}</p>
            </div>
          )}
          {education && (
            <div>
              <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: '700', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Education</p>
              <p style={{ margin: 0, fontSize: '13px', color: '#3f3f46', lineHeight: 1.6 }}>{education}</p>
            </div>
          )}
          {profile.agentReasoning && (
            <div style={{ borderLeft: '3px solid var(--accent)', paddingLeft: '10px', margin: '8px 0', backgroundColor: 'rgba(0, 229, 255, 0.05)', padding: '10px', borderRadius: '6px' }}>
              <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: '700', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🤖 AI Agent Reasoning</p>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6 }}>{profile.agentReasoning}</p>
            </div>
          )}
          {profile._searchedSkills && (
            <div>
              <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: '700', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Searched With</p>
              <p style={{ margin: 0, fontSize: '12px', color: '#71717a' }}>{profile._searchedSkills.join(', ')} · {profile._searchedDesignation} · {profile._searchedLocation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CandidatesPage({ masterLeads, setMasterLeads }) {
  const location = useLocation();
  const highlightedUrl = location.state?.highlightCandidateUrl || '';

  // Filter state
  const [searchText, setSearchText] = useState('');
  const [filterSkills, setFilterSkills] = useState([]);
  const [skillFilterInput, setSkillFilterInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  const availableMasterSkills = selectedCategory === 'All' ? ASIC_SKILLS : ASIC_SKILLS_CATEGORIZED[selectedCategory];
  const filteredMasterSkills = availableMasterSkills.filter(s => s.toLowerCase().includes(skillFilterInput.toLowerCase()));
  const [filterMinScore, setFilterMinScore] = useState(0);
  const [filterLocation, setFilterLocation] = useState('');
  const [filterOpenToWork, setFilterOpenToWork] = useState(false);
  const [sortBy, setSortBy] = useState('score_desc');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'compact'

  const toggleFilterSkill = (skill) => {
    setFilterSkills(prev => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]);
  };

  const removeCandidate = (profile) => {
    const urlToRemove = (profile.linkedinUrl || profile.url || '').split('?')[0].toLowerCase().trim();
    const updated = masterLeads.filter(lead => {
      const leadUrl = (lead.linkedinUrl || lead.url || '').split('?')[0].toLowerCase().trim();
      return leadUrl !== urlToRemove;
    });
    setMasterLeads(updated);
    if (updated.length === 0) {
      localStorage.removeItem('siliconPatternsMasterDatabase');
    } else {
      localStorage.setItem('siliconPatternsMasterDatabase', JSON.stringify(updated));
    }
  };

  const clearAll = () => {
    if (window.confirm('Delete ALL candidates from the Master Database? This cannot be undone.')) {
      setMasterLeads([]);
      localStorage.removeItem('siliconPatternsMasterDatabase');
    }
  };

  const downloadCSV = () => {
    if (masterLeads.length === 0) return;
    const headers = ['Match Score', 'First Name', 'Last Name', 'Current Title', 'Location', 'Skills', 'About', 'Experience', 'Education', 'LinkedIn URL'];
    const rows = masterLeads.map(p => {
      const loc = safeExtractText(p.location).replace(/[\r\n,"]/g, ' ');
      const title = safeExtractText(p.currentTitle || p.jobTitle || p.headline).replace(/[\r\n,"]/g, ' ');
      const skills = extractSkillsList(p).replace(/[\r\n,"]/g, ' ');
      const about = safeExtractText(p.about || p.summary).replace(/[\r\n,"]/g, ' ');
      const url = safeExtractText(p.linkedinUrl || p.url);

      let exp = 'N/A';
      if (p.positions && Array.isArray(p.positions)) exp = p.positions.map(e => `${e.title || ''} at ${e.companyName || ''}`).join(' | ');
      else if (p.experience && Array.isArray(p.experience)) exp = p.experience.map(e => `${e.title || ''} at ${e.company || ''}`).join(' | ');
      exp = exp.replace(/[\r\n,"]/g, ' ');

      let edu = 'N/A';
      if (p.educations && Array.isArray(p.educations)) edu = p.educations.map(e => `${e.degreeName || ''} from ${e.schoolName || ''}`).join(' | ');
      else if (p.education && Array.isArray(p.education)) edu = p.education.map(e => `${e.degreeName || ''} from ${e.schoolName || ''}`).join(' | ');
      edu = edu.replace(/[\r\n,"]/g, ' ');

      return `"${p.matchScore}","${safeExtractText(p.firstName)}","${safeExtractText(p.lastName)}","${title}","${loc}","${skills}","${about}","${exp}","${edu}","${url}"`;
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Silicon_Patterns_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Unique locations for filter dropdown
  const uniqueLocations = useMemo(() => {
    const locs = new Set();
    masterLeads.forEach(p => {
      const loc = safeExtractText(p.location).split(',')[0].trim();
      if (loc && loc !== 'N/A') locs.add(loc);
    });
    return Array.from(locs).sort();
  }, [masterLeads]);

  // Filtered + sorted candidates
  const filteredCandidates = useMemo(() => {
    let results = [...masterLeads];

    // Text search across name, title, skills, about
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      results = results.filter(p => {
        const name = `${safeExtractText(p.firstName)} ${safeExtractText(p.lastName)}`.toLowerCase();
        const title = safeExtractText(p.currentTitle || p.jobTitle || p.headline).toLowerCase();
        const skills = extractSkillsList(p).toLowerCase();
        const about = safeExtractText(p.about || p.summary).toLowerCase();
        const loc = safeExtractText(p.location).toLowerCase();
        return name.includes(q) || title.includes(q) || skills.includes(q) || about.includes(q) || loc.includes(q);
      });
    }

    // Skill filter (must have ALL selected skills)
    if (filterSkills.length > 0) {
      results = results.filter(p => {
        const skills = extractSkillsList(p).toLowerCase();
        return filterSkills.every(skill => skills.includes(skill.toLowerCase()));
      });
    }

    // Min score filter
    if (filterMinScore > 0) {
      results = results.filter(p => (p.matchScore || 0) >= filterMinScore);
    }

    // Location filter
    if (filterLocation) {
      results = results.filter(p => safeExtractText(p.location).toLowerCase().includes(filterLocation.toLowerCase()));
    }

    // Open to work filter
    if (filterOpenToWork) {
      results = results.filter(p => {
        const headline = safeExtractText(p.headline).toLowerCase();
        const title = safeExtractText(p.currentTitle || p.jobTitle).toLowerCase();
        return headline.includes('open to work') || headline.includes('#opentowork') || title.includes('open to work');
      });
    }

    // Sort
    switch (sortBy) {
      case 'score_desc': results.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0)); break;
      case 'score_asc': results.sort((a, b) => (a.matchScore || 0) - (b.matchScore || 0)); break;
      case 'name_asc': results.sort((a, b) => safeExtractText(a.lastName).localeCompare(safeExtractText(b.lastName))); break;
      case 'name_desc': results.sort((a, b) => safeExtractText(b.lastName).localeCompare(safeExtractText(a.lastName))); break;
      default: break;
    }

    return results;
  }, [masterLeads, searchText, filterSkills, filterMinScore, filterLocation, filterOpenToWork, sortBy]);

  const hasActiveFilters = searchText || filterSkills.length > 0 || filterMinScore > 0 || filterLocation || filterOpenToWork;

  const resetFilters = () => {
    setSearchText('');
    setFilterSkills([]);
    setFilterMinScore(0);
    setFilterLocation('');
    setFilterOpenToWork(false);
    setSkillFilterInput('');
    setSelectedCategory('All');
  };

  const inputStyle = {
    width: '100%', padding: '9px 12px', boxSizing: 'border-box',
    borderRadius: '6px', border: '1px solid var(--border-color)',
    fontSize: '13px', color: 'var(--text-primary)', outline: 'none',
    fontFamily: 'inherit', backgroundColor: 'var(--bg-main)',
  };

  if (masterLeads.length === 0) {
    return (
      <div style={{ padding: '80px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>🗂️</div>
        <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>No candidates yet</h2>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>Run a search from the Search page to populate your Master Database.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 20px', maxWidth: '1400px', margin: '0 auto' }}>

      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Candidate Database
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
            {filteredCandidates.length} of {masterLeads.length} candidates
            {hasActiveFilters && <span style={{ color: 'var(--accent)', fontWeight: '600' }}> · Filters active</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={downloadCSV} style={{ padding: '8px 16px', backgroundColor: 'var(--accent)', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}>
            ⬇️ Export CSV
          </button>
          <button onClick={clearAll} style={{ padding: '8px 12px', backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#f87171', border: '1px solid rgba(248, 113, 113, 0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
            Clear All
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
        {/* Row 1: Search + Sort + View */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', fontSize: '14px', pointerEvents: 'none' }}>🔍</span>
            <input
              type="text"
              placeholder="Search by name, title, skill, location..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{ ...inputStyle, paddingLeft: '36px' }}
            />
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...inputStyle, width: 'auto', paddingRight: '28px' }}>
            <option value="score_desc">Score: High → Low</option>
            <option value="score_asc">Score: Low → High</option>
            <option value="name_asc">Name: A → Z</option>
            <option value="name_desc">Name: Z → A</option>
          </select>
          <div style={{ display: 'flex', gap: '4px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '3px', backgroundColor: 'var(--bg-main)' }}>
            {[['list', '☰'], ['compact', '⊞']].map(([mode, icon]) => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                padding: '5px 10px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                fontSize: '14px', transition: 'all 0.1s',
                backgroundColor: viewMode === mode ? 'var(--bg-surface-hover)' : 'transparent',
                color: viewMode === mode ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: viewMode === mode ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
              }}>{icon}</button>
            ))}
          </div>
        </div>

        {/* Row 2: Location + Min Score + Open to Work + Reset */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
          <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
            <option value="">All Locations</option>
            {uniqueLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
          </select>

          <div>
            <select value={filterMinScore} onChange={e => setFilterMinScore(Number(e.target.value))} style={{ ...inputStyle, width: '100%' }}>
              <option value={0}>Any Score</option>
              <option value={25}>25+ Score</option>
              <option value={50}>50+ Score</option>
              <option value={70}>70+ Score</option>
              <option value={85}>85+ Score</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', whiteSpace: 'nowrap' }}>
            <input type="checkbox" id="filterOTW" checked={filterOpenToWork} onChange={e => setFilterOpenToWork(e.target.checked)}
              style={{ width: '14px', height: '14px', accentColor: 'var(--accent)', cursor: 'pointer' }} />
            <label htmlFor="filterOTW" style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>Open to Work</label>
          </div>

          {hasActiveFilters && (
            <button onClick={resetFilters} style={{ padding: '8px 14px', backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#f87171', border: '1px solid rgba(248, 113, 113, 0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
              Clear Filters
            </button>
          )}
        </div>

        {/* Row 3: Skill chips */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
            <p style={{ margin: 0, fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Filter by Skill (must have all selected)</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} style={{ ...inputStyle, width: '200px' }}>
              <option value="All">All Categories</option>
              {Object.keys(ASIC_SKILLS_CATEGORIZED).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="text"
              placeholder="Search category skills..."
              value={skillFilterInput}
              onChange={e => setSkillFilterInput(e.target.value)}
              style={{ ...inputStyle, flex: 1, maxWidth: '300px' }}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '150px', overflowY: 'auto', padding: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
            {filterSkills.map(skill => (
                <button key={skill} onClick={() => toggleFilterSkill(skill)} style={{
                  padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '500',
                  cursor: 'pointer', transition: 'all 0.15s',
                  border: '1px solid var(--accent)', backgroundColor: 'var(--accent)', color: '#000',
                }}>{skill} ✕</button>
            ))}
            {filteredMasterSkills.filter(s => !filterSkills.includes(s)).map(skill => (
                <button key={skill} onClick={() => toggleFilterSkill(skill)} style={{
                  padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '500',
                  cursor: 'pointer', transition: 'all 0.15s',
                  border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)',
                }}>{skill}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Score Summary Bar */}
      {filteredCandidates.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {[
            { label: 'High Match (70+)', count: filteredCandidates.filter(p => p.matchScore >= 70).length, color: '#4ade80', bg: 'rgba(22, 163, 74, 0.15)' },
            { label: 'Mid Match (40–69)', count: filteredCandidates.filter(p => p.matchScore >= 40 && p.matchScore < 70).length, color: '#fbbf24', bg: 'rgba(217, 119, 6, 0.15)' },
            { label: 'Low Match (<40)', count: filteredCandidates.filter(p => p.matchScore < 40).length, color: 'var(--text-secondary)', bg: 'var(--bg-main)' },
          ].map(({ label, count, color, bg }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', backgroundColor: bg, borderRadius: '6px' }}>
              <span style={{ fontSize: '18px', fontWeight: '800', color, lineHeight: 1 }}>{count}</span>
              <span style={{ fontSize: '12px', fontWeight: '500', color, opacity: 0.8 }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Candidates List */}
      {filteredCandidates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: 'var(--bg-surface)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
          <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>No candidates match your filters</h3>
          <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>Try loosening the filters or clearing them entirely.</p>
          <button onClick={resetFilters} style={{ padding: '8px 20px', backgroundColor: 'var(--accent)', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}>
            Reset All Filters
          </button>
        </div>
      ) : viewMode === 'list' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredCandidates.map((p, idx) => (
            <CandidateCard key={idx} profile={p} onRemove={removeCandidate} isHighlighted={highlightedUrl === (p.linkedinUrl || p.url)} />
          ))}
        </div>
      ) : (
        // Compact grid view
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '10px' }}>
          {filteredCandidates.map((p, idx) => {
            const scoreColors = getScoreColor(p.matchScore);
            const name = `${safeExtractText(p.firstName)} ${safeExtractText(p.lastName)}`.trim();
            const title = safeExtractText(p.currentTitle || p.jobTitle || p.headline);
            const url = safeExtractText(p.linkedinUrl || p.url);
            const skills = extractSkillsList(p);
            return (
              <div key={idx} style={{
                backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                borderRadius: '10px', padding: '14px 16px',
                transition: 'box-shadow 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '2px' }}>
                      <p style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>{name}</p>
                      <span style={{ 
                        fontSize: '9px', 
                        fontWeight: '600', 
                        backgroundColor: STAGE_BADGES[p.status || 'sourced'].bg, 
                        color: STAGE_BADGES[p.status || 'sourced'].text, 
                        border: `1px solid ${STAGE_BADGES[p.status || 'sourced'].border}`,
                        padding: '1px 5px', 
                        borderRadius: '10px',
                        display: 'inline-block',
                        lineHeight: '1.2'
                      }}>
                        {STAGE_BADGES[p.status || 'sourced'].label}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title.substring(0, 50)}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginLeft: '8px', flexShrink: 0 }}>
                    <span style={{ backgroundColor: scoreColors.bg, color: scoreColors.text, border: `1px solid ${scoreColors.border}`, padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '800' }}>
                      {p.matchScore}
                    </span>
                    {url && url !== 'N/A' && (
                      <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', backgroundColor: 'rgba(0, 229, 255, 0.1)', borderRadius: '4px', color: 'var(--accent)', border: '1px solid rgba(0, 229, 255, 0.3)', fontSize: '10px', fontWeight: '700', textDecoration: 'none' }}>in</a>
                    )}
                    <button onClick={() => removeCandidate(p)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', backgroundColor: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(248, 113, 113, 0.3)', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', color: '#f87171' }}>×</button>
                  </div>
                </div>
                <p style={{ margin: '0 0 8px', fontSize: '11px', color: 'var(--text-secondary)' }}>📍 {safeExtractText(p.location).split(',')[0]}</p>
                {skills && skills !== '' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {skills.split(', ').slice(0, 5).map((skill, i) => (
                      <span key={i} style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: '500', backgroundColor: 'var(--bg-main)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>{skill}</span>
                    ))}
                    {skills.split(', ').length > 5 && <span style={{ padding: '2px 6px', fontSize: '10px', color: 'var(--text-secondary)' }}>+{skills.split(', ').length - 5}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
