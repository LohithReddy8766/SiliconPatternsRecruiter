/**
 * Supabase Database Sync Helper using Native Fetch API (Zero Dependencies)
 */

// Helper to normalize linkedin/profile URL as key
function cleanUrl(url) {
  if (!url) return '';
  return url.split('?')[0].toLowerCase().trim();
}

/**
 * Fetch all candidate records from Supabase table 'candidates'
 */
export async function fetchCandidatesFromSupabase(url, key) {
  const cleanBaseUrl = url.replace(/\/$/, '');
  const res = await fetch(`${cleanBaseUrl}/rest/v1/candidates?select=*`, {
    method: 'GET',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to fetch candidates: ${errText || res.statusText}`);
  }

  const data = await res.json();
  
  // Map Supabase fields back to React candidate schema
  return data.map(item => ({
    firstName: item.first_name || '',
    lastName: item.last_name || '',
    headline: item.headline || '',
    currentTitle: item.current_title || '',
    jobTitle: item.current_title || '',
    location: item.location || '',
    matchScore: item.match_score || 0,
    status: item.status || 'sourced',
    agentScore: item.agent_score !== null ? item.agent_score : undefined,
    agentReasoning: item.agent_reasoning || undefined,
    linkedinUrl: item.linkedin_url,
    url: item.linkedin_url,
    ...(item.profile_data || {}) // merge any additional fields stored inside profile_data JSONB
  }));
}

/**
 * Upsert candidates (insert new ones or update existing ones by primary key 'linkedin_url')
 */
export async function upsertCandidatesToSupabase(url, key, candidates) {
  if (!candidates || candidates.length === 0) return;

  const cleanBaseUrl = url.replace(/\/$/, '');
  
  // Format profiles to match Supabase database schema
  const payload = candidates.map(c => {
    const rawUrl = c.linkedinUrl || c.url || '';
    const uniqueUrl = cleanUrl(rawUrl);

    // Filter out extra keys to avoid clogging the main columns, save them in profile_data
    const { 
      firstName, lastName, headline, currentTitle, jobTitle, location, 
      matchScore, status, agentScore, agentReasoning, ...extraData 
    } = c;

    return {
      linkedin_url: uniqueUrl,
      first_name: firstName || '',
      last_name: lastName || '',
      headline: headline || '',
      current_title: currentTitle || jobTitle || '',
      location: location || '',
      match_score: matchScore || 0,
      status: status || 'sourced',
      agent_score: agentScore !== undefined ? agentScore : null,
      agent_reasoning: agentReasoning || null,
      profile_data: extraData || {}
    };
  });

  const res = await fetch(`${cleanBaseUrl}/rest/v1/candidates`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates' // Tells postgrest to upsert on duplicate primary key
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to save candidates to Supabase: ${errText || res.statusText}`);
  }
}

/**
 * Delete a candidate from Supabase using their linkedin_url
 */
export async function deleteCandidateFromSupabase(url, key, candidate) {
  const rawUrl = candidate.linkedinUrl || candidate.url || '';
  const uniqueUrl = cleanUrl(rawUrl);
  if (!uniqueUrl) return;

  const cleanBaseUrl = url.replace(/\/$/, '');

  const res = await fetch(`${cleanBaseUrl}/rest/v1/candidates?linkedin_url=eq.${encodeURIComponent(uniqueUrl)}`, {
    method: 'DELETE',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to delete candidate: ${errText || res.statusText}`);
  }
}
