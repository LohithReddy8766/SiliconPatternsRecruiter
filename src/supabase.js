/**
 * Supabase Database Sync Helper using Native Fetch API (Zero Dependencies)
 */

// Helper to normalize linkedin/profile URL as key
function cleanUrl(url) {
  if (!url) return '';
  return url.split('?')[0].toLowerCase().trim();
}

// Once RLS requires the `authenticated` role, requests must carry the
// logged-in user's own access token — the shared anon key by itself only
// authenticates as `anon` and gets zero rows back. `apikey` still identifies
// the project; `Authorization` carries whichever token actually proves who
// is asking. Callers without a token (falls back to the anon key) will be
// rejected by RLS on any policy scoped to `authenticated`.
function authHeaders(anonKey, accessToken) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken || anonKey}`
  };
}

/**
 * Fetch all candidate records from Supabase table 'candidates'.
 *
 * PostgREST (what Supabase's REST API runs on) caps a single request at
 * 1000 rows by default — a bare `select=*` silently returns only the first
 * 1000 even when the table holds more, with no error to indicate rows were
 * left out. This paginates in chunks (ordered by the primary key so paging
 * stays stable across requests) until a genuinely empty page comes back, so
 * it keeps working correctly regardless of table size or the project's
 * configured row cap.
 */
export async function fetchCandidatesFromSupabase(url, key, accessToken) {
  const cleanBaseUrl = url.replace(/\/$/, '');
  const pageSize = 1000;
  let data = [];
  let offset = 0;
  const MAX_PAGES = 200; // safety cap: 200k rows, well beyond realistic use

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(
      `${cleanBaseUrl}/rest/v1/candidates?select=*&order=linkedin_url.asc&limit=${pageSize}&offset=${offset}`,
      { method: 'GET', headers: authHeaders(key, accessToken) }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to fetch candidates: ${errText || res.statusText}`);
    }

    const batch = await res.json();
    if (batch.length === 0) break;
    data = data.concat(batch);
    offset += batch.length;
    if (batch.length < pageSize) break; // short page = last page
  }

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
export async function upsertCandidatesToSupabase(url, key, candidates, accessToken) {
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
        ...authHeaders(key, accessToken),
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
export async function deleteCandidateFromSupabase(url, key, candidate, accessToken) {
  const rawUrl = candidate.linkedinUrl || candidate.url || '';
  const uniqueUrl = cleanUrl(rawUrl);
  if (!uniqueUrl) return;

  const cleanBaseUrl = url.replace(/\/$/, '');

  const res = await fetch(`${cleanBaseUrl}/rest/v1/candidates?linkedin_url=eq.${encodeURIComponent(uniqueUrl)}`, {
    method: 'DELETE',
    headers: authHeaders(key, accessToken)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to delete candidate: ${errText || res.statusText}`);
  }
}

/**
 * Atomically reserve the next LinkedIn search page for a query signature.
 * Backed by the `reserve_search_page` Postgres function so concurrent runs
 * across the whole team never grab the same page. Returns the 1-based page
 * this caller should scrape.
 */
export async function reserveSearchPage(url, key, signature, accessToken) {
  const cleanBaseUrl = url.replace(/\/$/, '');
  const res = await fetch(`${cleanBaseUrl}/rest/v1/rpc/reserve_search_page`, {
    method: 'POST',
    headers: { ...authHeaders(key, accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_signature: signature })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to reserve search page: ${errText || res.statusText}`);
  }

  const page = await res.json();
  const n = parseInt(page, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Read the current shared page for a query signature WITHOUT advancing it.
 * Returns 1 when no cursor exists yet.
 */
export async function peekSearchPage(url, key, signature, accessToken) {
  const cleanBaseUrl = url.replace(/\/$/, '');
  const res = await fetch(`${cleanBaseUrl}/rest/v1/rpc/peek_search_page`, {
    method: 'POST',
    headers: { ...authHeaders(key, accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_signature: signature })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to read search page: ${errText || res.statusText}`);
  }

  const page = await res.json();
  const n = parseInt(page, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Explicitly set the shared page for a query signature (manual page jump).
 */
export async function setSearchPage(url, key, signature, page, accessToken) {
  const cleanBaseUrl = url.replace(/\/$/, '');
  const res = await fetch(`${cleanBaseUrl}/rest/v1/rpc/set_search_page`, {
    method: 'POST',
    headers: { ...authHeaders(key, accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_signature: signature, p_page: Math.max(1, parseInt(page, 10) || 1) })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to set search page: ${errText || res.statusText}`);
  }
}

/**
 * Reset the shared cursor for a query signature back to page 1.
 */
export async function resetSearchPage(url, key, signature, accessToken) {
  const cleanBaseUrl = url.replace(/\/$/, '');
  const res = await fetch(`${cleanBaseUrl}/rest/v1/rpc/reset_search_page`, {
    method: 'POST',
    headers: { ...authHeaders(key, accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_signature: signature })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to reset search page: ${errText || res.statusText}`);
  }
}

/**
 * Log recruiter activity to 'recruiter_activities' in Supabase
 */
export async function logRecruiterActivity(url, key, activity, accessToken) {
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
      headers: { ...authHeaders(key, accessToken), 'Content-Type': 'application/json' },
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
export async function fetchRecruiterActivities(url, key, accessToken) {
  if (!url || !key) return [];
  const cleanBaseUrl = url.replace(/\/$/, '');

  const res = await fetch(`${cleanBaseUrl}/rest/v1/recruiter_activities?select=*&order=created_at.desc`, {
    method: 'GET',
    headers: authHeaders(key, accessToken)
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

/**
 * Check if an email is in the approved_emails allowlist
 */
export async function checkEmailApproved(url, key, email, accessToken) {
  if (!url || !key || !email) return false;
  const cleanEmail = email.toLowerCase().trim();
  const cleanBaseUrl = url.replace(/\/$/, '');

  const res = await fetch(`${cleanBaseUrl}/rest/v1/approved_emails?email=eq.${encodeURIComponent(cleanEmail)}&select=email`, {
    method: 'GET',
    headers: authHeaders(key, accessToken)
  });

  if (!res.ok) {
    console.error(`Failed to check email approval: ${await res.text()}`);
    return false;
  }

  const data = await res.json();
  return data.length > 0;
}

/**
 * Get all approved emails
 */
export async function getApprovedEmails(url, key, accessToken) {
  if (!url || !key) return [];
  const cleanBaseUrl = url.replace(/\/$/, '');

  const res = await fetch(`${cleanBaseUrl}/rest/v1/approved_emails?select=*`, {
    method: 'GET',
    headers: authHeaders(key, accessToken)
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch approved emails: ${await res.text()}`);
  }

  return await res.json();
}

/**
 * Add an email to the allowlist
 */
export async function addApprovedEmail(url, key, email, accessToken) {
  if (!url || !key || !email) return;
  const cleanBaseUrl = url.replace(/\/$/, '');

  const payload = {
    email: email.toLowerCase().trim()
  };

  const res = await fetch(`${cleanBaseUrl}/rest/v1/approved_emails`, {
    method: 'POST',
    headers: {
      ...authHeaders(key, accessToken),
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`Failed to add approved email: ${await res.text()}`);
  }
}

/**
 * Remove an email from the allowlist
 */
export async function removeApprovedEmail(url, key, email, accessToken) {
  if (!url || !key || !email) return;
  const cleanBaseUrl = url.replace(/\/$/, '');
  const cleanEmail = email.toLowerCase().trim();

  const res = await fetch(`${cleanBaseUrl}/rest/v1/approved_emails?email=eq.${encodeURIComponent(cleanEmail)}`, {
    method: 'DELETE',
    headers: authHeaders(key, accessToken)
  });

  if (!res.ok) {
    throw new Error(`Failed to remove approved email: ${await res.text()}`);
  }
}

/**
 * Get all pending user requests
 */
export async function getPendingUsers(url, key, accessToken) {
  if (!url || !key) return [];
  const cleanBaseUrl = url.replace(/\/$/, '');

  const res = await fetch(`${cleanBaseUrl}/rest/v1/pending_users?select=*`, {
    method: 'GET',
    headers: authHeaders(key, accessToken)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to fetch pending users: ${errText}`);
  }

  return await res.json();
}

/**
 * Add an email to the pending list
 */
export async function addPendingUser(url, key, email, accessToken) {
  if (!url || !key || !email) return;
  const cleanBaseUrl = url.replace(/\/$/, '');

  const payload = {
    email: email.toLowerCase().trim()
  };

  const res = await fetch(`${cleanBaseUrl}/rest/v1/pending_users`, {
    method: 'POST',
    headers: {
      ...authHeaders(key, accessToken),
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to add pending user: ${errText}`);
  }
}

/**
 * Remove an email from the pending list
 */
export async function removePendingUser(url, key, email, accessToken) {
  if (!url || !key || !email) return;
  const cleanBaseUrl = url.replace(/\/$/, '');
  const cleanEmail = email.toLowerCase().trim();

  const res = await fetch(`${cleanBaseUrl}/rest/v1/pending_users?email=eq.${encodeURIComponent(cleanEmail)}`, {
    method: 'DELETE',
    headers: authHeaders(key, accessToken)
  });

  if (!res.ok) {
    throw new Error(`Failed to remove pending user: ${await res.text()}`);
  }
}
