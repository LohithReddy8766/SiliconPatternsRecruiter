/**
 * Autonomous AI Recruitment Agent using Groq
 * Implements a ReAct (Reasoning and Action) loop to evaluate candidates.
 */

export async function runCandidateAgent({
  apiKey,
  model,
  roleRequirements,
  candidate,
  onStep
}) {
  // Define tools that the agent can execute
  const tools = {
    get_profile_basics: {
      description: "Returns candidate basic details: Name, headline, current job title, and location.",
      execute: () => ({
        firstName: candidate.firstName || 'N/A',
        lastName: candidate.lastName || 'N/A',
        headline: candidate.headline || 'N/A',
        currentTitle: candidate.currentTitle || candidate.jobTitle || 'N/A',
        location: candidate.location || 'N/A'
      })
    },
    get_positions: {
      description: "Returns candidate's professional work experience timeline (positions, companies, descriptions, dates).",
      execute: () => {
        const positions = candidate.positions || candidate.experience || [];
        return positions.map(pos => ({
          title: pos.title || 'N/A',
          companyName: pos.companyName || pos.company || 'N/A',
          description: pos.description || 'N/A',
          duration: pos.duration || 'N/A',
          location: pos.location || 'N/A'
        }));
      }
    },
    get_skills: {
      description: "Returns the candidate's complete list of skills.",
      execute: () => {
        if (!candidate.skills) return [];
        if (Array.isArray(candidate.skills)) {
          return candidate.skills.map(s => typeof s === 'string' ? s : (s.name || s.title || '')).filter(Boolean);
        }
        return String(candidate.skills).split(',').map(s => s.trim());
      }
    },
    get_education: {
      description: "Returns the candidate's academic background (degrees, schools, fields of study).",
      execute: () => {
        const educations = candidate.educations || candidate.education || [];
        return educations.map(edu => ({
          schoolName: edu.schoolName || 'N/A',
          degreeName: edu.degreeName || 'N/A',
          fieldOfStudy: edu.fieldOfStudy || 'N/A'
        }));
      }
    },
    check_keyword_match: {
      description: "Scans candidate profile data for specific keywords and returns match counts.",
      execute: ({ keywords }) => {
        if (!Array.isArray(keywords)) return { error: "keywords must be an array of strings" };
        const results = {};
        const fullText = JSON.stringify(candidate).toLowerCase();
        keywords.forEach(kw => {
          const regex = new RegExp(kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
          const matches = fullText.match(regex);
          results[kw] = matches ? matches.length : 0;
        });
        return results;
      }
    }
  };

  // Build the system instructions for the agent
  const systemPrompt = `You are an expert technical recruitment AI agent evaluating candidate profiles for a specific job requirement.
You work autonomously by executing a ReAct loop: Thinking, calling tools to analyze candidate details, and reflecting on your observations before reaching a conclusion.

You have access to the following tools:
${Object.entries(tools).map(([name, t]) => `- ${name}: ${t.description}`).join('\n')}

For each turn, you MUST write your output using exactly one of the following two formats:

Format 1 (To call a tool):
Thought: <explain why you need to call a tool or what information you are looking for next>
Action: <tool_name>({ <arguments_as_valid_json> })

Format 2 (To provide your final recommendation):
Thought: <summarize your findings, weight the candidate's strengths against gaps, and justify the score>
Final Answer: { "score": <number from 0 to 100>, "reasoning": "<professional, structured reasoning explaining the score, alignment of skills, experience level, and any critical gaps>" }

CRITICAL RULES:
1. Only call ONE tool at a time.
2. The Action argument must be valid JSON, e.g., Action: check_keyword_match({ "keywords": ["UVM", "PCIe"] }).
3. Do not place markdown backticks (\`\`\`) around your Action. Write it exactly as: Action: tool_name({ "arg": "value" }).
4. Never assume. If you need details about skills, call get_skills. If you need experience timeline, call get_positions.
5. Once you have gathered sufficient information, immediately output Format 2 (Final Answer). Keep your reasoning concise and object-driven.

JOB DESCRIPTION / TARGET REQUIREMENT:
${roleRequirements}
`;

  let history = [
    { role: 'system', content: systemPrompt }
  ];

  let stepCount = 0;
  const maxSteps = 8;

  onStep({
    step: 0,
    type: 'start',
    message: `Initializing autonomous agent pipeline for candidate: ${candidate.firstName || ''} ${candidate.lastName || ''}`
  });

  while (stepCount < maxSteps) {
    stepCount++;
    let responseText = "";
    let fetchSuccess = false;
    let retries = 5;
    let retryDelay = 2000; // start with 2s delay

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
            messages: history,
            temperature: 0.1,
            max_tokens: 1200
          })
        });

        if (res.status === 429) {
          onStep({
            step: stepCount,
            type: 'warning',
            message: `Rate limit hit (TPM). Waiting ${retryDelay / 1000}s before retrying...`
          });
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retries--;
          retryDelay *= 2; // exponential backoff
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
          onStep({
            step: stepCount,
            type: 'warning',
            message: `Rate limit triggered: ${e.message}. Retrying in ${retryDelay / 1000}s...`
          });
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retries--;
          retryDelay *= 2;
          continue;
        }

        onStep({
          step: stepCount,
          type: 'error',
          message: `Agent API connection failed: ${e.message}`
        });
        throw e;
      }
    }

    if (!fetchSuccess) {
      throw new Error(`Agent failed to communicate with Groq after multiple retries due to Rate Limits.`);
    }

    // Record agent's response
    history.push({ role: 'assistant', content: responseText });

    // Parse Thought
    const thoughtMatch = responseText.match(/Thought:([\s\S]*?)(Action:|Final Answer:)/i);
    const thought = thoughtMatch ? thoughtMatch[1].trim() : responseText.replace(/(Action:|Final Answer:)[\s\S]*/i, '').replace(/Thought:/i, '').trim();

    onStep({
      step: stepCount,
      type: 'thought',
      message: thought || "Evaluating next analytical step..."
    });

    // Check for Final Answer
    const isFinal = /Final Answer:/i.test(responseText);
    if (isFinal) {
      const finalMatch = responseText.match(/Final Answer:\s*([\s\S]*)/i);
      if (finalMatch) {
        try {
          const jsonStr = finalMatch[1].trim().replace(/^```json/, '').replace(/```$/, '').trim();
          const parsed = JSON.parse(jsonStr);
          onStep({
            step: stepCount,
            type: 'final',
            result: parsed
          });
          return parsed;
        } catch (e) {
          // Attempt string parsing or salvage
          console.warn("Agent final output was not clean JSON. Attempting salvage...", e);
          const scoreMatch = finalMatch[1].match(/"score":\s*(\d+)/);
          const score = scoreMatch ? parseInt(scoreMatch[1]) : 50;
          const reasoningMatch = finalMatch[1].match(/"reasoning":\s*"([\s\S]*?)"/);
          const reasoning = reasoningMatch ? reasoningMatch[1] : finalMatch[1].trim();

          const salvaged = { score, reasoning };
          onStep({
            step: stepCount,
            type: 'final',
            result: salvaged
          });
          return salvaged;
        }
      }
    }

    // Check for Action
    const actionMatch = responseText.match(/Action:\s*([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)/i);
    if (actionMatch) {
      const toolName = actionMatch[1].trim();
      const toolArgsStr = actionMatch[2].trim();

      onStep({
        step: stepCount,
        type: 'tool_call',
        message: `Tool Call: ${toolName}(${toolArgsStr})`
      });

      let observation;
      if (tools[toolName]) {
        try {
          // Normalize args: wrap single args or parse JSON
          const parsedArgs = toolArgsStr ? JSON.parse(toolArgsStr) : {};
          observation = tools[toolName].execute(parsedArgs);
        } catch (err) {
          observation = { error: `Failed to execute tool due to invalid JSON arguments: ${err.message}` };
        }
      } else {
        observation = { error: `Requested tool '${toolName}' is not available.` };
      }

      const observationStr = JSON.stringify(observation);
      onStep({
        step: stepCount,
        type: 'observation',
        message: `Tool Output: ${observationStr.substring(0, 180)}${observationStr.length > 180 ? '...' : ''}`
      });

      history.push({
        role: 'user',
        content: `Observation: ${observationStr}`
      });
    } else {
      // Prompt agent to stick to the format
      onStep({
        step: stepCount,
        type: 'warning',
        message: "Agent did not format output correctly. Sending format reminder."
      });
      history.push({
        role: 'user',
        content: `System Alert: You did not specify an Action or a Final Answer in the correct format. 
Please continue your evaluation and respond using either:
Thought: <thinking>
Action: <tool_name>({ <arguments> })
or
Thought: <thinking>
Final Answer: { "score": <number>, "reasoning": "<reasoning>" }`
      });
    }
  }

  throw new Error(`Agent failed to output a Final Answer within ${maxSteps} cycles.`);
}
