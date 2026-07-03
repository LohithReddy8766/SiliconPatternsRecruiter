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
    assignedRecruiterEmail: item.assigned_recruiter_email || '',
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
      matchScore, status, agentScore, agentReasoning, assignedRecruiterEmail, assigned_recruiter_email, ...extraData 
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
      assigned_recruiter_email: assignedRecruiterEmail || assigned_recruiter_email || null,
      profile_data: extraData || {}
    };
  });

  // Chunk payload into batches of 50 to avoid 413 Payload Too Large
  const chunkSize = 50;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    const res = await fetch(`${cleanBaseUrl}/rest/v1/candidates`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates' // Tells postgrest to upsert on duplicate primary key
      },
      body: JSON.stringify(chunk)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to save candidates chunk to Supabase: ${errText || res.statusText}`);
    }
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

/**
 * Log recruiter activity to 'recruiter_activities' in Supabase
 */
export async function logRecruiterActivity(url, key, activity) {
  if (!url || !key) return;
  const cleanBaseUrl = url.replace(/\/$/, '');
  
  const payload = {
    recruiter_email: activity.recruiterEmail,
    candidate_linkedin_url: cleanUrl(activity.candidateLinkedinUrl || activity.candidateUrl),
    candidate_name: activity.candidateName || 'Candidate',
    action_type: activity.actionType,
    from_stage: activity.fromStage || null,
    to_stage: activity.toStage || null,
    skills: activity.skills || []
  };

  try {
    const res = await fetch(`${cleanBaseUrl}/rest/v1/recruiter_activities`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      console.warn(`Failed to log recruiter activity: ${await res.text()}`);
    }
  } catch (err) {
    console.error('Error logging recruiter activity:', err);
  }
}

/**
 * Fetch recruiter activities from Supabase
 */
export async function fetchRecruiterActivities(url, key) {
  if (!url || !key) return [];
  const cleanBaseUrl = url.replace(/\/$/, '');
  
  const res = await fetch(`${cleanBaseUrl}/rest/v1/recruiter_activities?select=*&order=created_at.desc`, {
    method: 'GET',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to fetch recruiter activities: ${errText || res.statusText}`);
  }

  const data = await res.json();
  return data.map(item => ({
    id: item.id,
    recruiterEmail: item.recruiter_email,
    candidateLinkedinUrl: item.candidate_linkedin_url,
    candidateName: item.candidate_name,
    actionType: item.action_type,
    fromStage: item.from_stage,
    toStage: item.to_stage,
    skills: item.skills || [],
    createdAt: item.created_at
  }));
}
