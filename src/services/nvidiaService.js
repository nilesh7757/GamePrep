const isProd = import.meta.env.PROD;

const PROVIDERS = {
  hf: {
    name: 'HF_HUB (Qwen-2.5-Elite)',
    api_key: import.meta.env.VITE_HF_API_KEY,
    model: 'Qwen/Qwen2.5-72B-Instruct',
    base_url: 'https://router.huggingface.co/v1/chat/completions'
  },
  nvidia: {
    name: 'NVIDIA_CORE (Minimax-Ultra)',
    api_key: import.meta.env.VITE_NVIDIA_API_KEY,
    model: 'minimaxai/minimax-m2.7',
    base_url: isProd ? 'https://integrate.api.nvidia.com/v1/chat/completions' : '/nvidia-api/v1/chat/completions'
  },
  groq: {
    name: 'GROQ_NODE (Llama-3.3)',
    api_key: import.meta.env.VITE_GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile',
    base_url: 'https://api.groq.com/openai/v1/chat/completions'
  }
};

const PROMPT_TEMPLATE = (track, xp) => {
  const isInputMode = Math.random() > 0.5; 
  const difficulty = xp < 300 ? 'Junior Associate' : 
                     xp < 800 ? 'Mid-Level Engineer' : 
                     xp < 1500 ? 'Senior Staff' : 
                     xp < 3000 ? 'Principal Architect' : 'L10 / Fellow';
  
  const trackContexts = {
    'dsa': `Difficulty: ${difficulty}. Challenge the user with complex data structures (Tries, Segment Trees, Graphs) or highly optimized DP solutions.`,
    'ml': `Difficulty: ${difficulty}. Focus on mathematical foundations, specific optimizer behaviors, or scaling laws for LLMs.`,
    'system_design': `Difficulty: ${difficulty}. Challenge the user with edge cases in distributed consistency (CAP/PACELC), global low-latency patterns, or observability at scale.`,
    'oops_db': `Difficulty: ${difficulty}. Focus on complex concurrency patterns, isolation levels (Repeatable Read vs Serializable), or advanced design patterns.`
  };

  return `
    You are an Elite Technical Interviewer at a Tier-1 Tech Giant (Google/Meta/NVIDIA). 
    Difficulty Level: ${difficulty} (Current XP: ${xp}). 
    Target Track: ${track.toUpperCase()}.
    
    ${trackContexts[track] || 'Provide a challenging technical scenario.'}

    Generate ONE highly specific technical challenge in valid JSON format:
    {
      "mode": "${isInputMode ? 'input' : 'choice'}",
      "scenario": "A brief, professional context setting the stage (2-3 sentences).",
      "code_snippet": "A formatted code block in C++, Python, or JavaScript, or 'N/A' if not applicable.",
      "question": "The specific technical problem to solve.",
      "options": ["Option A", "Option B", "Option C", "Option D"], 
      "correct_answer": "The exact string of the correct option or the precise answer for input mode.",
      "explanation": "A deep-dive technical explanation of why the answer is correct and the underlying computer science principles (3-4 sentences)."
    }

    Rules:
    - If mode is 'choice', provide 4 plausible but distinct options.
    - If mode is 'input', the question MUST ask for a short, single technical term, a numeric value, a Big O complexity (e.g. 'O(N log N)'), or a specific keyword.
    - NEVER ask the user to write code, write functions, or provide long-form text answers in 'input' mode.
    - Output ONLY the JSON object.
  `;
};

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

const executeFetch = async (config, track, xp, customPrompt = null) => {
  if (!config.api_key) {
    console.error(`[AI_ERROR] Missing API Key for ${config.name}`);
    throw new Error("MISSING_API_KEY");
  }

  console.log(`[AI_FETCH] Attempting to reach ${config.name}...`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000); // 35s timeout
  
  try {
    const response = await fetch(config.base_url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.api_key}` },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: customPrompt || PROMPT_TEMPLATE(track, xp) }],
        temperature: 0.7
      })
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI_ERROR] ${config.name} returned HTTP ${response.status}:`, errorText);
      throw new Error(`HTTP_${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    const challenge = JSON.parse(content.substring(firstBrace, lastBrace + 1));
    
    const originalAnswer = challenge.correct_answer;
    
    if (challenge.mode === 'choice' && challenge.options) {
      challenge.options = shuffleArray([...challenge.options]);
    }
    
    console.log(`[AI_SUCCESS] Payload received from ${config.name}`);
    return { challenge, source: config.name, originalAnswer };
  } catch (error) {
    clearTimeout(timeoutId);
    const msg = error.name === 'AbortError' ? 'TIMEOUT (35s)' : error.message;
    console.warn(`[AI_RETRY] ${config.name} failed: ${msg}`);
    throw error;
  }
};

export const fetchChallenge = async (track, xp) => {
  try { return await executeFetch(PROVIDERS.hf, track, xp); } 
  catch (err) {
    try { return await executeFetch(PROVIDERS.nvidia, track, xp); } 
    catch (err2) {
      try { return await executeFetch(PROVIDERS.groq, track, xp); } 
      catch (err3) { 
        console.error("[CRITICAL] All AI providers exhausted.");
        throw new Error("TOTAL_AI_SILENCE"); 
      }
    }
  }
};

export const fetchGhostChallenge = async (failedEntry) => {
  const prompt = `System-memory recycler. Failed: "${failedEntry.question}". Generate mutated SAME concept. JSON required.`;
  try { return await executeFetch(PROVIDERS.groq, 'Ghost', 0, prompt); } 
  catch (err) { throw new Error("GHOST_FAILED"); }
};

export const fetchResearch = async (topic, question) => {
  const prompt = `
    You are a Senior Staff Engineer. Provide a "Deep Research" lecture note on the following topic: "${topic}".
    The student recently missed a question related to: "${question}".
    
    Structure your response using Markdown:
    # [Topic Title]
    ## 🔍 Core Concept
    ...detailed explanation...
    ## 🛠️ Implementation & Trade-offs
    ...practical application and what to watch out for...
    ## 🚀 Interview Pro-Tip
    ...what interviewers are really looking for regarding this topic...
    
    Keep it concise, technical, and high-impact. Use code blocks if necessary.
  `;
  try {
    const response = await fetch(PROVIDERS.groq.base_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PROVIDERS.groq.api_key}` },
      body: JSON.stringify({ model: PROVIDERS.groq.model, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (err) { throw new Error("PROF_OFFLINE"); }
};

export const fetchHint = async (question, context) => {
  const prompt = `You are a helpful Senior Engineer. The student is stuck on this question: "${question}". Provide a ONE-SENTENCE subtle hint that guides them without giving away the answer. Context: ${context}`;
  try {
    const response = await fetch(PROVIDERS.groq.base_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PROVIDERS.groq.api_key}` },
      body: JSON.stringify({ model: PROVIDERS.groq.model, messages: [{ role: 'user', content: prompt }], temperature: 0.5 })
    });
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (err) { return "Think about the space-time trade-off."; }
};

export const verifyAnswer = async (question, correct, guess) => {
  if (!guess || guess.length < 1) return { is_correct: false, feedback: "No payload detected." };
  
  // Quick pre-check for very short, non-matching answers
  if (guess.length === 1 && guess.toLowerCase() !== correct.toLowerCase()) {
    return { is_correct: false, feedback: "Payload too brief and non-matching." };
  }

  const prompt = `
    You are a Strict Technical Evaluator at a Top-Tier Tech Firm.
    
    Context:
    - Question: "${question}"
    - Expected Answer: "${correct}"
    - Student's Guess: "${guess}"

    Rules:
    1. The guess must be semantically equivalent to the expected answer.
    2. Be extremely pedantic. A guess that is too vague (like a single letter "t" for "O(L)") is INCORRECT.
    3. Big O notation (e.g., "O(N)") should be treated as equivalent to descriptive terms (e.g., "Linear Time").
    4. If the guess is just garbage or unrelated, it is INCORRECT.

    Output ONLY this JSON:
    {
      "is_correct": true/false,
      "feedback": "A very brief explanation of why the answer is correct or incorrect."
    }
  `;
  try {
    const response = await fetch(PROVIDERS.groq.base_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PROVIDERS.groq.api_key}` },
      body: JSON.stringify({ 
        model: PROVIDERS.groq.model, 
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1 // Maximum determinism
      })
    });
    const data = await response.json();
    const content = data.choices[0].message.content;
    return JSON.parse(content.substring(content.indexOf('{'), content.lastIndexOf('}') + 1));
  } catch (err) { 
    // Stricter offline fallback
    const isCorrect = guess.toLowerCase().trim() === correct.toLowerCase().trim();
    return { is_correct: isCorrect, feedback: isCorrect ? "Exact match (Offline)" : "Mismatch (Offline)" }; 
  }
};
