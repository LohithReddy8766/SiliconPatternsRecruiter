import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ASIC_SKILLS, ASIC_SKILLS_CATEGORIZED } from './skills.js';
import { isCandidateOpenToWork } from './App.jsx';

const STAGE_BADGES = {
  sourced: { label: 'Sourced', bg: 'var(--bg-surface)', text: 'var(--text-secondary)', border: 'var(--border-color)' },
  reached_out: { label: 'Reached Out', bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: 'rgba(96, 165, 250, 0.3)' },
  interviewing: { label: 'Interviewing', bg: 'rgba(217, 119, 6, 0.15)', text: '#fbbf24', border: 'rgba(251, 191, 36, 0.3)' },
  offer: { label: 'Offer Extended', bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: 'rgba(192, 132, 252, 0.3)' },
  hired: { label: 'Hired', bg: 'rgba(22, 163, 74, 0.15)', text: '#4ade80', border: 'rgba(74, 222, 128, 0.3)' },
  rejected: { label: 'Rejected', bg: 'rgba(220, 38, 38, 0.15)', text: '#f87171', border: 'rgba(248, 113, 113, 0.3)' }
};

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

export function extractSkillsList(profile) {
  if (!profile.skills) return '';
  if (Array.isArray(profile.skills)) {
    return profile.skills.map(s => typeof s === 'string' ? s : (s.name || s.title || '')).filter(Boolean).join(', ');
  }
  return safeExtractText(profile.skills).replace(/[\r\n,"]/g, ' ');
}

export function matchSkillFlexible(text, query) {
  if (!text || !query) return false;
  const tLower = text.toLowerCase();
  const qLower = query.toLowerCase();

  if (tLower.includes(qLower)) return true;

  const normT = tLower.replace(/[\s\.\-_]/g, '');
  const normQ = qLower.replace(/[\s\.\-_]/g, '');
  if (normT.includes(normQ)) return true;

  const genStrippedQ = normQ.replace(/gen/g, '');
  const genStrippedT = normT.replace(/gen/g, '');
  if (genStrippedT.includes(genStrippedQ)) return true;

  return false;
}

export function downloadCandidateResume(profile) {
  const name = `${safeExtractText(profile.firstName)} ${safeExtractText(profile.lastName)}`.trim();
  const filename = `${name.replace(/\s+/g, '_')}_Resume.doc`;
  
  // Format skills
  const skills = extractSkillsList(profile);
  const skillsHtml = skills && skills !== 'N/A' && skills !== ''
    ? skills.split(', ').map(s => `<span style="background-color: #f3f4f6; border: 1px solid #e5e7eb; padding: 4px 8px; border-radius: 4px; display: inline-block; margin: 2px; font-size: 11px; font-family: Arial, sans-serif; color: #374151;">${s}</span>`).join(' ')
    : 'No skills documented';

  // Format experience
  let experienceHtml = '';
  const positions = profile.positions || profile.experience || [];
  if (Array.isArray(positions) && positions.length > 0) {
    experienceHtml = positions.map(pos => {
      const title = pos.title || 'Role';
      const company = pos.companyName || pos.company || 'Company';
      const duration = pos.duration || pos.date || '';
      const desc = pos.description || '';
      return `
        <div style="margin-bottom: 16px; font-family: Arial, sans-serif;">
          <table style="width: 100%; font-size: 13px; font-weight: bold; color: #111827;">
            <tr>
              <td style="text-align: left;">${title}</td>
              <td style="text-align: right; font-weight: normal; color: #6b7280; font-size: 11px;">${duration}</td>
            </tr>
          </table>
          <div style="font-size: 12px; font-style: italic; color: #4b5563; margin-bottom: 4px;">${company}</div>
          ${desc ? `<div style="font-size: 12px; color: #4b5563; line-height: 1.4;">${desc}</div>` : ''}
        </div>
      `;
    }).join('');
  } else {
    experienceHtml = '<p style="font-size: 12px; color: #4b5563; font-style: italic;">No detailed work experience documented.</p>';
  }

  // Format education
  let educationHtml = '';
  const educations = profile.educations || profile.education || [];
  if (Array.isArray(educations) && educations.length > 0) {
    educationHtml = educations.map(edu => {
      const degree = edu.degreeName || 'Degree';
      const school = edu.schoolName || edu.school || 'Institution';
      const date = edu.date || edu.duration || '';
      return `
        <div style="margin-bottom: 10px; font-size: 12px; font-family: Arial, sans-serif; color: #374151;">
          <span style="font-weight: bold;">${degree}</span> — <span>${school}</span>
          ${date ? `<span style="color: #6b7280; font-size: 11px; margin-left: 8px;">(${date})</span>` : ''}
        </div>
      `;
    }).join('');
  } else {
    educationHtml = '<p style="font-size: 12px; color: #4b5563; font-style: italic;">No detailed education documented.</p>';
  }

  // Format AI Screening evaluation details if present
  let aiSectionHtml = '';
  if (profile.agentScore !== undefined && profile.agentScore !== null) {
    aiSectionHtml = `
      <div style="margin-top: 30px; padding: 16px; background-color: #faf5ff; border: 1px solid #e9d5ff; border-left: 5px solid #a855f7; border-radius: 6px; font-family: Arial, sans-serif;">
        <h3 style="margin: 0 0 8px 0; color: #7e22ce; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Silicon Patterns AI Screening Assessment</h3>
        <div style="font-size: 14px; font-weight: bold; color: #7e22ce; margin-bottom: 8px;">Screening Match Score: ${profile.agentScore} / 100</div>
        ${profile.agentReasoning ? `
          <div style="font-size: 12px; color: #581c87; line-height: 1.5; white-space: pre-line;">
            <strong>Evaluation Rationale:</strong><br/>
            ${profile.agentReasoning}
          </div>
        ` : ''}
      </div>
    `;
  }

  const html = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' 
          xmlns:w='urn:schemas-microsoft-com:office:word' 
          xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>${name} - Resume</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        body { font-family: 'Arial', sans-serif; line-height: 1.5; color: #374151; margin: 40px; }
        h1 { color: #111827; font-size: 24px; margin-bottom: 2px; font-weight: bold; font-family: 'Arial', sans-serif; }
        .title { font-size: 14px; color: #4b5563; margin-bottom: 8px; font-style: italic; font-family: 'Arial', sans-serif; }
        .meta { font-size: 10px; color: #6b7280; margin-bottom: 24px; font-family: 'Arial', sans-serif; }
        h2 { color: #4f46e5; font-size: 13px; font-weight: bold; margin-top: 24px; margin-bottom: 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; font-family: 'Arial', sans-serif; }
        p { font-size: 12px; color: #374151; margin-top: 0; margin-bottom: 12px; line-height: 1.6; font-family: 'Arial', sans-serif; }
      </style>
    </head>
    <body>
      <div style="font-family: Arial, sans-serif;">
        <h1>${name}</h1>
        <div class="title">${safeExtractText(profile.currentTitle || profile.jobTitle || profile.headline)}</div>
        <div class="meta">
          ${safeExtractText(profile.location)} | ${safeExtractText(profile.linkedinUrl || profile.url)}
        </div>
        
        <h2>Professional Summary</h2>
        <p>${safeExtractText(profile.about || profile.summary || 'Semiconductor engineering professional.')}</p>
        
        <h2>Core Technical Skills</h2>
        <div style="margin-bottom: 20px;">
          ${skillsHtml}
        </div>
        
        <h2>Professional Experience</h2>
        ${experienceHtml}
        
        <h2>Education</h2>
        ${educationHtml}
        
        ${aiSectionHtml}
      </div>
    </body>
    </html>
  `;

  const blob = new Blob([html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getScoreColor(score) {
  if (score >= 70) return { bg: 'rgba(22, 163, 74, 0.15)', text: '#4ade80', border: 'rgba(74, 222, 128, 0.3)' };
  if (score >= 40) return { bg: 'rgba(217, 119, 6, 0.15)', text: '#fbbf24', border: 'rgba(251, 191, 36, 0.3)' };
  return { bg: 'var(--bg-main)', text: 'var(--text-secondary)', border: 'var(--border-color)' };
}

function CandidateCard({ profile, onRemove, isHighlighted, filterSkills, filterLocation }) {
  const [expanded, setExpanded] = useState(isHighlighted || false);
  const [showAllSkills, setShowAllSkills] = useState(false);
  const name = `${safeExtractText(profile.firstName)} ${safeExtractText(profile.lastName)}`.trim();
  const title = safeExtractText(profile.currentTitle || profile.jobTitle || profile.headline);
  const location = safeExtractText(profile.location).split(',')[0];
  const skills = extractSkillsList(profile);
  const url = safeExtractText(profile.linkedinUrl || profile.url);
  const about = safeExtractText(profile.about || profile.summary);

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

  // AI Outreach States
  const [showOutreach, setShowOutreach] = useState(false);
  const [customContext, setCustomContext] = useState('');
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachError, setOutreachError] = useState('');
  const [outreachSequence, setOutreachSequence] = useState(null);
  const [activeOutreachTab, setActiveOutreachTab] = useState('linkedin');
  const [copiedTab, setCopiedTab] = useState(null);

  const generateOutreach = async () => {
    const apiKey = localStorage.getItem('siliconPatternsGroqApiKey') || '';
    if (!apiKey.trim()) {
      setOutreachError('Please set a Groq API Key in the Settings tab first.');
      return;
    }

    setOutreachLoading(true);
    setOutreachError('');
    setOutreachSequence(null);

    const promptMessages = [
      {
        role: 'system',
        content: `You are an expert technical recruiter sourcing elite engineering talent (particularly in ASIC/VLSI, verification, hardware design, and physical design).
Generate a personalized, high-conversion 3-step outreach sequence:
1. A brief LinkedIn Connection Request (strictly under 300 characters, clear, concise).
2. A direct Initial Outreach Email (compelling subject line, short, highlighting candidate background match, clear call to action).
3. A short follow-up email.

Return your response ONLY as a valid JSON object matching the schema below:
{
  "linkedin_invite": "LinkedIn connection message...",
  "initial_email": "Subject: ...\\n\\nBody...",
  "follow_up": "Subject: ...\\n\\nBody..."
}
Do not return any other text, reasoning, markdown or explanation before or after the JSON.`
      },
      {
        role: 'user',
        content: `Candidate Details:
Name: ${name}
Title: ${title}
Location: ${location}
Skills: ${skills}
About: ${about}
Recent Roles: ${experience}
Education: ${education}

Recruiter's target requirements:
Target Designation/Skills: ${profile._searchedDesignation || ''} (${profile._searchedSkills?.join(', ') || ''})
Company/Role Pitch: ${customContext || 'General pitch matching the candidate\'s expertise'}

Generate the JSON outreach sequence now.`
      }
    ];

    let retries = 3;
    let delay = 2000;
    while (retries > 0) {
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: promptMessages,
            temperature: 0.7,
            max_tokens: 1500,
            response_format: { type: "json_object" }
          })
        });

        if (res.status === 429) {
          retries--;
          if (retries === 0) throw new Error("Rate limit exceeded on Groq API. Please try again in a moment.");
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to call Groq API.");
        }

        const data = await res.json();
        const contentText = data.choices[0].message.content;
        const parsed = JSON.parse(contentText);
        setOutreachSequence(parsed);
        setOutreachLoading(false);
        return;
      } catch (err) {
        console.error("Error generating outreach:", err);
        if (retries === 0 || !err.message.includes("429")) {
          setOutreachError(err.message || 'An unexpected error occurred during generation.');
          setOutreachLoading(false);
          return;
        }
      }
    }
  };

  return (
    <div style={{
      backgroundColor: isHighlighted ? 'var(--bg-surface-hover)' : 'var(--bg-surface)',
      border: isHighlighted ? '2px solid var(--accent)' : '1px solid var(--border-color)',
      borderRadius: '8px',
      overflow: 'hidden',
      transition: 'border-color 0.15s ease',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-hover)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = isHighlighted ? 'var(--accent)' : 'var(--border-color)'}
    >
      {/* Card Header */}
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          {/* Avatar + Name */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
            <div style={{
              width: '40px', height: '40px', flexShrink: 0,
              backgroundColor: 'var(--bg-main)', borderRadius: '50%', border: '1px solid var(--border-color)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-primary)', fontWeight: '600', fontSize: '14px',
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
                {isCandidateOpenToWork(profile) && (
                  <span style={{ fontSize: '10px', fontWeight: '600', color: '#4ade80', backgroundColor: 'rgba(22, 163, 74, 0.15)', padding: '2px 7px', borderRadius: '10px', border: '1px solid rgba(74, 222, 128, 0.3)' }}>
                    OPEN TO WORK
                  </span>
                )}
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: (filterLocation && location.toLowerCase().includes(filterLocation.toLowerCase())) ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: (filterLocation && location.toLowerCase().includes(filterLocation.toLowerCase())) ? '600' : 'normal' }}>{location}</p>
            </div>
          </div>

          {/* Score + Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {url && url !== 'N/A' && (
              <a href={url} target="_blank" rel="noopener noreferrer" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '30px', height: '30px',
                backgroundColor: 'var(--bg-surface)', borderRadius: '6px', border: '1px solid var(--border-color)',
                color: 'var(--text-primary)', fontSize: '12px', fontWeight: '600',
                textDecoration: 'none', flexShrink: 0,
              }}>in</a>
            )}
            <button
              onClick={() => downloadCandidateResume(profile)}
              title="Download Word Resume"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '30px', height: '30px',
                backgroundColor: 'var(--bg-surface)', borderRadius: '6px', border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s',
                flexShrink: 0,
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
        {skills && skills !== 'N/A' && skills !== '' && (() => {
          const skillsList = skills.split(', ');
          const visibleSkills = showAllSkills ? skillsList : skillsList.slice(0, 8);
          const hasMore = !showAllSkills && skillsList.length > 8;

          return (
            <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {visibleSkills.map((skill, i) => {
                const hasActiveFilter = filterSkills && filterSkills.length > 0;
                let isHighlight = false;
                let isFilterMatch = false;
                if (hasActiveFilter) {
                  isFilterMatch = filterSkills.some(fs => skill.toLowerCase().includes(fs.toLowerCase()));
                  isHighlight = isFilterMatch;
                } else {
                  isHighlight = ASIC_SKILLS.includes(skill);
                }
                return (
                  <span key={i} style={{
                    padding: '2px 8px', borderRadius: '4px',
                    fontSize: '11px', fontWeight: '500',
                    backgroundColor: isHighlight ? 'var(--bg-surface)' : 'var(--bg-main)',
                    color: isHighlight ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: isFilterMatch ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                  }}>{skill}</span>
                );
              })}
              {hasMore && (
                <button 
                  onClick={() => setShowAllSkills(true)}
                  style={{ 
                    padding: '2px 8px', borderRadius: '4px', fontSize: '11px', 
                    color: 'var(--text-secondary)', backgroundColor: 'var(--bg-main)', 
                    border: '1px solid var(--border-color)', cursor: 'pointer', transition: 'all 0.15s' 
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                >
                  +{skillsList.length - 8} more
                </button>
              )}
              {showAllSkills && skillsList.length > 8 && (
                <button 
                  onClick={() => setShowAllSkills(false)}
                  style={{ 
                    padding: '2px 8px', borderRadius: '4px', fontSize: '11px', 
                    color: 'var(--text-secondary)', backgroundColor: 'var(--bg-main)', 
                    border: '1px solid var(--border-color)', cursor: 'pointer', transition: 'all 0.15s' 
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                >
                  Show less
                </button>
              )}
            </div>
          );
        })()}
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
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6 }}>{education}</p>
            </div>
          )}
          {profile._searchedSkills && (
            <div>
              <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: '700', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Searched With</p>
              <p style={{ margin: 0, fontSize: '12px', color: '#71717a' }}>{profile._searchedSkills.join(', ')} · {profile._searchedDesignation} · {profile._searchedLocation}</p>
            </div>
          )}

          {/* Outreach Campaign Section */}
          <div style={{ marginTop: '6px', borderTop: '1px dashed var(--border-color)', paddingTop: '14px' }}>
            <button
              onClick={() => setShowOutreach(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                backgroundColor: showOutreach ? 'var(--bg-surface)' : 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: '500',
                color: showOutreach ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: 'pointer', transition: 'all 0.15s'
              }}
            >
              {showOutreach ? 'Close AI Outreach Campaign' : 'AI Outreach Campaign'}
            </button>

            {showOutreach && (
              <div style={{ marginTop: '12px', padding: '14px', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                {!outreachSequence ? (
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Custom Company Pitch / Target Role (Optional)
                    </label>
                    <textarea
                      value={customContext}
                      onChange={e => setCustomContext(e.target.value)}
                      placeholder="e.g. We are building a RISC-V automotive accelerator and need an assertion-based verification expert..."
                      style={{
                        width: '100%', minHeight: '70px', padding: '10px 12px', boxSizing: 'border-box',
                        borderRadius: '6px', border: '1px solid var(--border-color)',
                        fontSize: '13px', color: 'var(--text-primary)', outline: 'none',
                        fontFamily: 'inherit', backgroundColor: 'var(--bg-main)', resize: 'vertical',
                        marginBottom: '10px'
                      }}
                    />
                    {outreachError && (
                      <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#f87171' }}>{outreachError}</p>
                    )}
                    <button
                      onClick={generateOutreach}
                      disabled={outreachLoading}
                      style={{
                        backgroundColor: outreachLoading ? 'var(--border-color)' : 'var(--accent)',
                        color: outreachLoading ? 'var(--text-secondary)' : 'var(--accent-fg)',
                        border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '12px',
                        fontWeight: '500', cursor: outreachLoading ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      {outreachLoading ? 'Generating Campaign Sequence...' : 'Generate Campaign Sequence'}
                    </button>
                  </div>
                ) : (
                  <div>
                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '12px' }}>
                      {[
                        { id: 'linkedin', label: 'LinkedIn invite' },
                        { id: 'email', label: 'Initial Email' },
                        { id: 'followup', label: 'Follow-up Email' }
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => { setActiveOutreachTab(tab.id); setCopiedTab(null); }}
                          style={{
                            border: 'none', background: 'none', padding: '6px 12px', borderRadius: '4px',
                            fontSize: '11px', fontWeight: '500', cursor: 'pointer',
                            color: activeOutreachTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                            backgroundColor: activeOutreachTab === tab.id ? 'var(--bg-surface-hover)' : 'transparent',
                            transition: 'all 0.15s'
                          }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Tab Content */}
                    <div style={{ position: 'relative', backgroundColor: 'var(--bg-main)', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border-color)', marginBottom: '12px' }}>
                      <pre style={{
                        margin: 0, fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap',
                        fontFamily: 'inherit', lineHeight: 1.6, minHeight: '80px'
                      }}>
                        {activeOutreachTab === 'linkedin' && outreachSequence.linkedin_invite}
                        {activeOutreachTab === 'email' && outreachSequence.initial_email}
                        {activeOutreachTab === 'followup' && outreachSequence.follow_up}
                      </pre>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center' }}>
                      <button
                        onClick={() => {
                          const text = activeOutreachTab === 'linkedin' ? outreachSequence.linkedin_invite :
                                       activeOutreachTab === 'email' ? outreachSequence.initial_email :
                                       outreachSequence.follow_up;
                          navigator.clipboard.writeText(text);
                          setCopiedTab(activeOutreachTab);
                        }}
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-primary)',
                          borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: '500',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                        }}
                      >
                        {copiedTab === activeOutreachTab ? 'Copied!' : 'Copy to Clipboard'}
                      </button>

                      <button
                        onClick={() => setOutreachSequence(null)}
                        style={{
                          background: 'none', border: 'none', color: 'var(--text-secondary)',
                          fontSize: '11px', textDecoration: 'underline', cursor: 'pointer'
                        }}
                      >
                        Regenerate / Edit Settings
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const ITEMS_PER_PAGE = 20;

export default function CandidatesPage({ masterLeads, setMasterLeads }) {
  const location = useLocation();
  const highlightedUrl = location.state?.highlightCandidateUrl || '';

  useEffect(() => {
    if (highlightedUrl) {
      const target = masterLeads.find(c => {
        const curl = (c.linkedinUrl || c.url || '').split('?')[0].toLowerCase().trim();
        const turl = highlightedUrl.split('?')[0].toLowerCase().trim();
        return curl === turl || curl === `candidate-${masterLeads.indexOf(c)}`;
      });
      if (target) {
        setSearchText(`${safeExtractText(target.firstName)} ${safeExtractText(target.lastName)}`.trim());
      }
    }
  }, [highlightedUrl, masterLeads]);

  // Filter state
  const [searchText, setSearchText] = useState('');
  const [filterSkills, setFilterSkills] = useState([]);
  const [skillFilterInput, setSkillFilterInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [customFilterSkill, setCustomFilterSkill] = useState('');

  const handleAddCustomFilterSkill = () => {
    if (customFilterSkill.trim() && !filterSkills.includes(customFilterSkill.trim())) {
      setFilterSkills(prev => [...prev, customFilterSkill.trim()]);
      setCustomFilterSkill('');
    }
  };
  
  const availableMasterSkills = selectedCategory === 'All' ? ASIC_SKILLS : ASIC_SKILLS_CATEGORIZED[selectedCategory];
  const filteredMasterSkills = availableMasterSkills.filter(s => s.toLowerCase().includes(skillFilterInput.toLowerCase()));
  const [filterLocation, setFilterLocation] = useState('');
  const [filterOpenToWork, setFilterOpenToWork] = useState(false);
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'compact'

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  // Collapsible skill filter
  const [showSkillFilter, setShowSkillFilter] = useState(false);
  // CSV export: how many candidates to include ('' = all)
  const [exportCount, setExportCount] = useState('');

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
  };

  const clearAll = () => {
    if (window.confirm('Delete ALL candidates from the Master Database? This cannot be undone.')) {
      setMasterLeads([]);
    }
  };

  const downloadCSV = () => {
    if (filteredCandidates.length === 0) return;
    // Respect the requested export count (blank / <=0 = all).
    const n = parseInt(exportCount, 10);
    const exportList = (Number.isFinite(n) && n > 0)
      ? filteredCandidates.slice(0, n)
      : filteredCandidates;
    const headers = ['First Name', 'Last Name', 'Current Title', 'Location', 'Skills', 'About', 'Experience Level', 'Open To Work', 'LinkedIn URL'];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const s = String(str);
      return '"' + s.replace(/"/g, '""') + '"';
    };

    const getLevel = (title) => {
      if (!title) return '';
      const t = title.toLowerCase();
      if (t.includes('chief') || t.includes('cto') || t.includes('ceo') || t.includes('cfo')) return 'C-Level';
      if (t.includes('vp') || t.includes('vice president')) return 'VP';
      if (t.includes('director')) return 'Director';
      if (t.includes('manager')) return 'Manager';
      if (t.includes('principal') || t.includes('architect')) return 'Principal/Architect';
      if (t.includes('staff')) return 'Staff';
      if (t.includes('senior') || t.includes('sr.') || t.includes('sr ')) return 'Senior';
      if (t.includes('lead')) return 'Lead';
      if (t.includes('junior') || t.includes('jr.') || t.includes('jr ')) return 'Junior';
      return title; // fallback to title
    };

    const rows = exportList.map(p => {
      const loc = safeExtractText(p.location);
      const title = safeExtractText(p.currentTitle || p.jobTitle || p.headline);
      const skills = extractSkillsList(p);
      const about = safeExtractText(p.about || p.summary);
      const url = safeExtractText(p.linkedinUrl || p.url);
      const openToWork = isCandidateOpenToWork(p) ? 'Yes' : 'No';

      let exp = 'N/A';
      if (p.positions && Array.isArray(p.positions)) exp = p.positions.map(e => getLevel(e.title)).filter(Boolean).join(' | ');
      else if (p.experience && Array.isArray(p.experience)) exp = p.experience.map(e => getLevel(e.title)).filter(Boolean).join(' | ');

      return [safeExtractText(p.firstName), safeExtractText(p.lastName), title, loc, skills, about, exp, openToWork, url]
        .map(escapeCsv)
        .join(',');
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
      const q = searchText.trim();
      results = results.filter(p => {
        const name = `${safeExtractText(p.firstName)} ${safeExtractText(p.lastName)}`;
        const title = safeExtractText(p.currentTitle || p.jobTitle || p.headline);
        const skills = extractSkillsList(p);
        const about = safeExtractText(p.about || p.summary);
        const loc = safeExtractText(p.location);
        return matchSkillFlexible(name, q) || matchSkillFlexible(title, q) || matchSkillFlexible(skills, q) || matchSkillFlexible(about, q) || matchSkillFlexible(loc, q);
      });
    }

    // Skill filter (must match selected skills flexibly)
    if (filterSkills.length > 0) {
      results = results.filter(p => {
        const skills = extractSkillsList(p);
        const title = safeExtractText(p.currentTitle || p.jobTitle || p.headline);
        const about = safeExtractText(p.about || p.summary);
        const fullText = `${skills} ${title} ${about}`;
        return filterSkills.every(skill => matchSkillFlexible(fullText, skill));
      });
    }

    // Location filter
    if (filterLocation) {
      results = results.filter(p => {
        const loc = safeExtractText(p.location).split(',')[0].trim();
        return loc === filterLocation;
      });
    }

    // Open to Work filter
    if (filterOpenToWork) {
      results = results.filter(p => isCandidateOpenToWork(p));
    }

    // Sort
    const getCreatedAt = (p) => p.createdAt ? new Date(p.createdAt).getTime() : 0;
    switch (sortBy) {
      case 'newest': results.sort((a, b) => getCreatedAt(b) - getCreatedAt(a)); break;
      case 'oldest': results.sort((a, b) => getCreatedAt(a) - getCreatedAt(b)); break;
      case 'name_asc': results.sort((a, b) => safeExtractText(a.lastName).localeCompare(safeExtractText(b.lastName))); break;
      case 'name_desc': results.sort((a, b) => safeExtractText(b.lastName).localeCompare(safeExtractText(a.lastName))); break;
      default: break;
    }

    return results;
  }, [masterLeads, searchText, filterSkills, filterLocation, filterOpenToWork, sortBy]);

  // Pagination logic
  const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedCandidates = filteredCandidates.slice(
    (safeCurrentPage - 1) * ITEMS_PER_PAGE,
    safeCurrentPage * ITEMS_PER_PAGE
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchText, filterSkills, filterLocation, filterOpenToWork, sortBy]);

  const hasActiveFilters = searchText || filterSkills.length > 0 || filterLocation || filterOpenToWork;

  const resetFilters = () => {
    setSearchText('');
    setFilterSkills([]);
    setFilterLocation('');
    setFilterOpenToWork(false);
    setSkillFilterInput('');
    setSelectedCategory('All');
    setCurrentPage(1);
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
        <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>No candidates yet</h2>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>Run a search from the Search page to populate your Master Database.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 20px', maxWidth: '1400px', margin: '0 auto', height: 'calc(100vh - 0px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxSizing: 'border-box' }}>

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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="number"
            min="1"
            value={exportCount}
            onChange={e => setExportCount(e.target.value)}
            placeholder={`All (${filteredCandidates.length})`}
            title="How many candidates to include in the CSV (leave blank for all). Exports the top N in the current sort order."
            style={{ width: '110px', padding: '7px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }}
          />
          <button onClick={downloadCSV} title="Export CSV" style={{ padding: '8px 12px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '32px', fontSize: '13px', fontWeight: '600' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            CSV
          </button>
          <button onClick={clearAll} title="Clear All Candidates" style={{ padding: '8px', backgroundColor: 'var(--bg-surface)', color: '#ef4444', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px 20px', marginBottom: '16px', flexShrink: 0 }}>
        {/* Row 1: Search + Sort + View */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '10px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </span>
            <input
              type="text"
              placeholder="Search by name, title, skill, location..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{ ...inputStyle, paddingLeft: '36px' }}
            />
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...inputStyle, width: 'auto', paddingRight: '28px' }}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
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
          {hasActiveFilters && (
            <button onClick={resetFilters} title="Clear Filters" style={{ padding: '6px', backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#f87171', border: '1px solid rgba(248, 113, 113, 0.3)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          )}
        </div>

        {/* Row 2: Location + Open to Work + Skill Filter Toggle */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)} style={{ ...inputStyle, width: '180px', flex: 'none' }}>
            <option value="">All Locations</option>
            {uniqueLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
          </select>

          <button
            onClick={() => setShowSkillFilter(v => !v)}
            style={{
              ...inputStyle,
              width: 'auto',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
              border: filterSkills.length > 0 ? '1px solid var(--accent)' : '1px solid var(--border-color)',
              color: filterSkills.length > 0 ? 'var(--accent)' : 'var(--text-primary)'
            }}
          >
            Skills {filterSkills.length > 0 && `(${filterSkills.length})`}
            {showSkillFilter ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            )}
          </button>

          <div
            onClick={() => setFilterOpenToWork(!filterOpenToWork)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: '8px' }}
          >
            <div style={{
              width: '36px', height: '20px', backgroundColor: filterOpenToWork ? 'var(--accent)' : 'var(--bg-surface)',
              borderRadius: '20px', position: 'relative', transition: 'background-color 0.2s',
              border: `1px solid ${filterOpenToWork ? 'var(--accent)' : 'var(--border-color)'}`
            }}>
              <div style={{
                width: '14px', height: '14px', backgroundColor: filterOpenToWork ? 'var(--accent-fg)' : 'var(--text-secondary)',
                borderRadius: '50%', position: 'absolute', top: '2px', left: filterOpenToWork ? '18px' : '2px',
                transition: 'all 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
              }} />
            </div>
            <span style={{ fontSize: '13px', fontWeight: '500', color: filterOpenToWork ? 'var(--text-primary)' : 'var(--text-secondary)', userSelect: 'none', transition: 'color 0.2s' }}>
              Open to Work
            </span>
          </div>

        </div>

        {/* Collapsible Skill Filter Panel */}
        {showSkillFilter && (
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
            {/* Selected skills as removable tags */}
            {filterSkills.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                {filterSkills.map(skill => (
                  <button key={skill} onClick={() => toggleFilterSkill(skill)} style={{
                    padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                    cursor: 'pointer', transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center', gap: '4px',
                    border: '1px solid var(--accent)', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)',
                  }}>{skill} <span style={{ fontSize: '13px', lineHeight: 1 }}>×</span></button>
                ))}
                <button onClick={() => setFilterSkills([])} style={{
                  padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '500',
                  cursor: 'pointer', border: '1px solid rgba(248, 113, 113, 0.3)',
                  backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#f87171',
                }}>Clear all</button>
              </div>
            )}

            {/* Category + Search row */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <select value={selectedCategory} onChange={e => { setSelectedCategory(e.target.value); setSkillFilterInput(''); }} style={{ ...inputStyle, width: '180px', flex: 'none' }}>
                <option value="All">All Categories</option>
                {Object.keys(ASIC_SKILLS_CATEGORIZED).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="text"
                placeholder="Type to search skills..."
                value={skillFilterInput}
                onChange={e => setSkillFilterInput(e.target.value)}
                style={{ ...inputStyle, flex: 1, maxWidth: '320px' }}
              />
              <input
                type="text"
                placeholder="Custom skill..."
                value={customFilterSkill}
                onChange={e => setCustomFilterSkill(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddCustomFilterSkill(); }}
                style={{ ...inputStyle, width: '140px', flex: 'none' }}
              />
              <button
                type="button"
                onClick={handleAddCustomFilterSkill}
                title="Add custom skill"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '35px', height: '35px', backgroundColor: 'var(--text-primary)', color: 'var(--bg-main)',
                  border: 'none', borderRadius: '6px', cursor: 'pointer'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
            </div>

            {/* Skill results */}
            {(() => {
              const unselectedSkills = filteredMasterSkills.filter(s => !filterSkills.includes(s));
              // Show skills if user is typing or selected a specific category
              const shouldShow = skillFilterInput.trim() || selectedCategory !== 'All';
              
              if (!shouldShow) return null;

              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', padding: '8px 10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                  {unselectedSkills.length === 0 ? (
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '4px 0' }}>
                      {skillFilterInput ? 'No skills match your search' : 'All skills in this category are selected'}
                    </span>
                  ) : (
                    unselectedSkills.map(skill => (
                      <button key={skill} onClick={() => toggleFilterSkill(skill)} style={{
                        padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '500',
                        cursor: 'pointer', transition: 'all 0.12s',
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
        )}
      </div>

      {/* Candidates List — Scrollable container */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {filteredCandidates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: 'var(--bg-surface)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>No candidates match your filters</h3>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>Try loosening the filters or clearing them entirely.</p>
            <button onClick={resetFilters} style={{ padding: '8px 20px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
              Reset All Filters
            </button>
          </div>
        ) : viewMode === 'list' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {paginatedCandidates.map((p, idx) => (
              <CandidateCard key={(safeCurrentPage - 1) * ITEMS_PER_PAGE + idx} profile={p} onRemove={removeCandidate} isHighlighted={highlightedUrl === (p.linkedinUrl || p.url)} filterSkills={filterSkills} filterLocation={filterLocation} />
            ))}
          </div>
        ) : (
          // Compact grid view
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '10px' }}>
            {paginatedCandidates.map((p, idx) => {
              const displayScore = (p.agentScore !== undefined && p.agentScore !== null) ? p.agentScore : null;
              const scoreColors = displayScore !== null ? getScoreColor(displayScore) : null;
              const name = `${safeExtractText(p.firstName)} ${safeExtractText(p.lastName)}`.trim();
              const title = safeExtractText(p.currentTitle || p.jobTitle || p.headline);
              const url = safeExtractText(p.linkedinUrl || p.url);
              const skills = extractSkillsList(p);
              return (
                <div key={(safeCurrentPage - 1) * ITEMS_PER_PAGE + idx} style={{
                  backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)',
                  borderRadius: '8px', padding: '14px 16px',
                  transition: 'border-color 0.15s',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-hover)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
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
                      {displayScore !== null && (
                        <span style={{ backgroundColor: scoreColors.bg, color: scoreColors.text, border: `1px solid ${scoreColors.border}`, padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '800' }}>
                          {displayScore}
                        </span>
                      )}
                      {url && url !== 'N/A' && (
                        <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', backgroundColor: 'rgba(0, 229, 255, 0.1)', borderRadius: '4px', color: 'var(--accent)', border: '1px solid rgba(0, 229, 255, 0.3)', fontSize: '10px', fontWeight: '700', textDecoration: 'none' }}>in</a>
                      )}
                      <button onClick={() => removeCandidate(p)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', backgroundColor: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(248, 113, 113, 0.3)', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', color: '#f87171' }}>×</button>
                    </div>
                  </div>
                  <p style={{ margin: '0 0 8px', fontSize: '11px', color: (filterLocation && safeExtractText(p.location).split(',')[0].toLowerCase().includes(filterLocation.toLowerCase())) ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: (filterLocation && safeExtractText(p.location).split(',')[0].toLowerCase().includes(filterLocation.toLowerCase())) ? '600' : 'normal' }}>{safeExtractText(p.location).split(',')[0]}</p>
                  {skills && skills !== '' && (() => {
                    const skillsList = skills.split(', ');
                    const hasActiveFilter = filterSkills && filterSkills.length > 0;
                    return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {skillsList.slice(0, 5).map((skill, i) => {
                          let isHighlight = false;
                          let isFilterMatch = false;
                          if (hasActiveFilter) {
                            isFilterMatch = filterSkills.some(fs => skill.toLowerCase().includes(fs.toLowerCase()));
                            isHighlight = isFilterMatch;
                          } else {
                            isHighlight = ASIC_SKILLS.includes(skill);
                          }
                          return (
                            <span key={i} style={{ 
                              padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: '500', 
                              backgroundColor: isHighlight ? 'var(--bg-surface)' : 'var(--bg-main)', 
                              color: isHighlight ? 'var(--text-primary)' : 'var(--text-secondary)', 
                              border: isFilterMatch ? '1px solid var(--accent)' : '1px solid var(--border-color)' 
                            }}>{skill}</span>
                          );
                        })}
                        {skillsList.length > 5 && <span style={{ padding: '2px 6px', fontSize: '10px', color: 'var(--text-secondary)' }}>+{skillsList.length - 5}</span>}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {filteredCandidates.length > ITEMS_PER_PAGE && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', padding: '14px 0 4px', flexShrink: 0, borderTop: '1px solid var(--border-color)', marginTop: '12px' }}>
          <button
            onClick={() => setCurrentPage(1)}
            disabled={safeCurrentPage === 1}
            style={{
              padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: '6px',
              backgroundColor: 'var(--bg-surface)', color: safeCurrentPage === 1 ? 'var(--text-secondary)' : 'var(--text-primary)',
              cursor: safeCurrentPage === 1 ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '500',
              opacity: safeCurrentPage === 1 ? 0.4 : 1,
            }}
          >«</button>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={safeCurrentPage === 1}
            style={{
              padding: '6px 12px', border: '1px solid var(--border-color)', borderRadius: '6px',
              backgroundColor: 'var(--bg-surface)', color: safeCurrentPage === 1 ? 'var(--text-secondary)' : 'var(--text-primary)',
              cursor: safeCurrentPage === 1 ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '500',
              opacity: safeCurrentPage === 1 ? 0.4 : 1,
            }}
          >← Prev</button>

          {/* Page number buttons */}
          {(() => {
            const pages = [];
            let startPage = Math.max(1, safeCurrentPage - 2);
            let endPage = Math.min(totalPages, startPage + 4);
            if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

            for (let i = startPage; i <= endPage; i++) {
              pages.push(
                <button
                  key={i}
                  onClick={() => setCurrentPage(i)}
                  style={{
                    padding: '6px 10px', border: i === safeCurrentPage ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                    borderRadius: '6px', fontSize: '12px', fontWeight: i === safeCurrentPage ? '700' : '500',
                    backgroundColor: i === safeCurrentPage ? 'var(--accent)' : 'var(--bg-surface)',
                    color: i === safeCurrentPage ? 'var(--accent-fg)' : 'var(--text-primary)',
                    cursor: 'pointer', minWidth: '34px', transition: 'all 0.15s',
                  }}
                >{i}</button>
              );
            }
            return pages;
          })()}

          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={safeCurrentPage === totalPages}
            style={{
              padding: '6px 12px', border: '1px solid var(--border-color)', borderRadius: '6px',
              backgroundColor: 'var(--bg-surface)', color: safeCurrentPage === totalPages ? 'var(--text-secondary)' : 'var(--text-primary)',
              cursor: safeCurrentPage === totalPages ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '500',
              opacity: safeCurrentPage === totalPages ? 0.4 : 1,
            }}
          >Next →</button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={safeCurrentPage === totalPages}
            style={{
              padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: '6px',
              backgroundColor: 'var(--bg-surface)', color: safeCurrentPage === totalPages ? 'var(--text-secondary)' : 'var(--text-primary)',
              cursor: safeCurrentPage === totalPages ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '500',
              opacity: safeCurrentPage === totalPages ? 0.4 : 1,
            }}
          >»</button>

          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
            {(safeCurrentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(safeCurrentPage * ITEMS_PER_PAGE, filteredCandidates.length)} of {filteredCandidates.length}
          </span>
        </div>
      )}
    </div>
  );
}
