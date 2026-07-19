import { ASIC_SKILLS_CATEGORIZED } from './skills.js';

// Simple helpers duplicated to avoid circular dependency
function extractSkillsList(profile) {
  if (!profile) return '';
  if (!profile.skills) return '';
  if (Array.isArray(profile.skills)) {
    return profile.skills.map(s => {
      if (!s) return '';
      return typeof s === 'string' ? s : (s.name || s.title || '');
    }).filter(Boolean).join(', ');
  }
  // Simplified safeExtractText for filtering
  const field = profile.skills;
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
  return String(field).replace(/[\r\n,"]/g, ' ');
}

const MONTH_ABBR = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function parseDurationToMonths(str) {
  if (!str) return 0;
  const s = String(str).toLowerCase();
  const yrMatch = s.match(/(\d+)\s*y(?:r|ear)s?/);
  const moMatch = s.match(/(\d+)\s*mo(?:nth)?s?/);
  if (yrMatch || moMatch) {
    const years = yrMatch ? parseInt(yrMatch[1], 10) : 0;
    const months = moMatch ? parseInt(moMatch[1], 10) : 0;
    return years * 12 + months;
  }
  const rangeMatch = s.match(/([a-z]{3,9})\.?\s+(\d{4})\s*[-–—]\s*(present|[a-z]{3,9}\.?\s+\d{4})/);
  if (rangeMatch) {
    const startMonth = MONTH_ABBR[rangeMatch[1].slice(0, 3)];
    const startYear = parseInt(rangeMatch[2], 10);
    if (startMonth === undefined || isNaN(startYear)) return 0;
    let endMonth, endYear;
    if (rangeMatch[3] === 'present') {
      const now = new Date();
      endMonth = now.getMonth();
      endYear = now.getFullYear();
    } else {
      const parts = rangeMatch[3].split(/\s+/);
      endMonth = MONTH_ABBR[parts[0].slice(0, 3)];
      endYear = parseInt(parts[1], 10);
    }
    if (endMonth === undefined || isNaN(endYear)) return 0;
    return (endYear - startYear) * 12 + (endMonth - startMonth);
  }
  return 0;
}

function computeTotalExperienceYears(positions) {
  if (!Array.isArray(positions) || positions.length === 0) return '';
  let totalMonths = 0;
  let matchedAny = false;
  positions.forEach(pos => {
    if (pos) {
      const months = parseDurationToMonths(pos.duration || pos.date || '');
      if (months > 0) { totalMonths += months; matchedAny = true; }
    }
  });
  return matchedAny ? (totalMonths / 12).toFixed(1) : '';
}

export function getFilteredLeadsForRecruiter(leads, currentUser) {
  if (!Array.isArray(leads)) return [];
  if (!currentUser) return leads;
  if (currentUser.role === 'admin') return leads;
  
  const email = currentUser.email?.toLowerCase().trim();
  if (!email) return leads;
  
  const rawSettings = localStorage.getItem('siliconPatternsRecruiterSettings');
  if (!rawSettings) return leads;
  
  try {
    const allSettings = JSON.parse(rawSettings);
    if (!allSettings || typeof allSettings !== 'object') return leads;
    
    const settings = allSettings[email];
    if (!settings) return leads;
    
    let filtered = [...leads];
    
    // 1. Filter by Categories
    if (settings.categories && settings.categories.length > 0) {
      filtered = filtered.filter(p => {
        if (!p) return false;
        const pSkills = extractSkillsList(p).toLowerCase();
        return settings.categories.some(cat => {
          const catSkills = ASIC_SKILLS_CATEGORIZED[cat] || [];
          return catSkills.some(skill => pSkills.includes(skill.toLowerCase()));
        });
      });
    }
    
    // 2. Filter by Skills
    if (settings.skills && settings.skills.length > 0) {
      filtered = filtered.filter(p => {
        if (!p) return false;
        const pSkills = extractSkillsList(p).toLowerCase();
        return settings.skills.some(skill => pSkills.includes(skill.toLowerCase()));
      });
    }
    
    // 3. Filter by Experience
    const hasMin = settings.experienceMin !== undefined && settings.experienceMin !== null && settings.experienceMin !== '';
    const hasMax = settings.experienceMax !== undefined && settings.experienceMax !== null && settings.experienceMax !== '';
    if (hasMin || hasMax) {
      const min = hasMin ? parseFloat(settings.experienceMin) : 0;
      const max = hasMax ? parseFloat(settings.experienceMax) : Infinity;
      
      filtered = filtered.filter(p => {
        if (!p) return false;
        const positions = p.positions || p.experience || [];
        const expStr = computeTotalExperienceYears(positions);
        const exp = expStr === '' ? 0 : parseFloat(expStr);
        return exp >= min && exp <= max;
      });
    }
    
    return filtered;
  } catch (e) {
    console.error("Error filtering leads for recruiter:", e);
    return leads;
  }
}
