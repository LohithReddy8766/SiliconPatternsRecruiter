/**
 * Autonomous AI Recruitment Agent using Groq
 * Evaluates candidate profiles in a single highly-efficient zero-shot pass
 * to minimize API rate limits and maximize processing speed.
 */

export async function runCandidateAgent({
  apiKey,
  model,
  roleRequirements,
  candidate,
  onStep
}) {
  // Extract clean candidate info for the prompt
  const skillsList = Array.isArray(candidate.skills) 
    ? candidate.skills.map(s => typeof s === 'string' ? s : (s.name || s.title || '')).filter(Boolean).join(', ') 
    : (candidate.skills || 'None listed');

  const expList = (candidate.positions || candidate.experience || [])
    .map(p => `- ${p.title || 'Unknown Role'} at ${p.companyName || p.company || 'Unknown Company'} (${p.duration || 'Unknown duration'})`)
    .join('\n');

  const eduList = (candidate.educations || candidate.education || [])
    .map(e => `- ${e.degreeName || 'Degree'} in ${e.fieldOfStudy || 'Field'} from ${e.schoolName || 'School'}`)
    .join('\n');

  const systemPrompt = `You are an expert technical recruitment AI agent evaluating a candidate for a specific job requirement.

JOB DESCRIPTION / TARGET REQUIREMENT:
${roleRequirements}

CANDIDATE DATA:
Name: ${candidate.firstName || 'Unknown'} ${candidate.lastName || ''}
Headline: ${candidate.headline || 'N/A'}
Current Title: ${candidate.currentTitle || candidate.jobTitle || 'N/A'}
Location: ${candidate.location || 'N/A'}

Skills:
${skillsList}

Experience:
${expList || 'None listed'}

Education:
${eduList || 'None listed'}

INSTRUCTIONS:
Evaluate the candidate strictly based on the Job Description. 

SCORING RUBRIC:
- 90-100: Exceptional match. Meets all requirements and has significant relevant experience.
- 75-89: Strong match. Meets core requirements but might lack in some secondary areas.
- 50-74: Partial match. Has some relevant background but missing key required skills or sufficient experience.
- 0-49: Poor match. Lacks the fundamental skills or experience required for the role.

You must return your evaluation in exactly the following JSON format:
{
  "analysis": "<step-by-step internal thought process comparing the candidate to the job requirements. Analyze the skills, experience, and gaps before deciding the score>",
  "score": <integer from 0 to 100 representing the match quality>,
  "reasoning": "<structured, professional summary explaining the final score, pointing out strengths and specific gaps based on the requirements>"
}
Do not include any markdown backticks or other text. Return ONLY the JSON object.`;

  onStep({
    step: 0,
    type: 'start',
    message: `Initializing zero-shot evaluation pipeline for: ${candidate.firstName || ''} ${candidate.lastName || ''}`
  });

  onStep({
    step: 1,
    type: 'observation',
    message: `Extracted Candidate Details:
- Title: ${candidate.currentTitle || candidate.jobTitle || 'N/A'}
- Skills: ${skillsList.substring(0, 100)}${skillsList.length > 100 ? '...' : ''}
- Experience: ${(candidate.positions || candidate.experience || []).length} roles found.`
  });

  onStep({
    step: 2,
    type: 'thought',
    message: `Compiling context and evaluating against requirements using ${model || 'llama-3.1-8b-instant'}...`
  });

  let responseText = "";
  let fetchSuccess = false;
  let retries = 6;
  let retryDelay = 2000;

  while (retries > 0 && !fetchSuccess) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model || "llama-3.1-8b-instant",
          messages: [{ role: 'system', content: systemPrompt }],
          temperature: 0.1,
          max_tokens: 800,
          response_format: { type: "json_object" }
        })
      });

      if (res.status === 429) {
        // Silently handle rate limits to avoid spamming the UI
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retries--;
        retryDelay *= 2;
        continue;
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Groq API returned HTTP ${res.status}`);
      }

      const resJson = await res.json();
      responseText = resJson.choices[0]?.message?.content || "";
      fetchSuccess = true;
    } catch (e) {
      if (e.message && (e.message.includes("Rate limit") || e.message.includes("rate_limit") || e.message.includes("429"))) {
        // Silently handle rate limits
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retries--;
        retryDelay *= 2;
        continue;
      }

      onStep({
        step: 3,
        type: 'error',
        message: `Agent API connection failed: ${e.message}`
      });
      throw e;
    }
  }

  if (!fetchSuccess) {
    throw new Error(`Evaluation failed after multiple retries due to Groq API Rate Limits.`);
  }

  try {
    const parsed = JSON.parse(responseText.trim());
    onStep({
      step: 4,
      type: 'final',
      result: parsed
    });
    return parsed;
  } catch (e) {
    console.warn("Agent final output was not valid JSON. Attempting salvage...", responseText);
    const scoreMatch = responseText.match(/"score":\s*(\d+)/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 50;
    const reasoningMatch = responseText.match(/"reasoning":\s*"([\s\S]*?)"/);
    const reasoning = reasoningMatch ? reasoningMatch[1] : responseText;

    const salvaged = { score, reasoning };
    onStep({
      step: 4,
      type: 'final',
      result: salvaged
    });
    return salvaged;
  }
}
