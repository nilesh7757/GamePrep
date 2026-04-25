const isProd = import.meta.env.PROD;

const PROVIDERS = {
  hf: {
    name: 'HF_HUB (Qwen-2.5-Elite)',
    api_key: import.meta.env.VITE_HF_API_KEY,
    model: 'Qwen/Qwen2.5-72B-Instruct',
    base_url: 'https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct/v1/chat/completions'
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
  const isInputMode = Math.random() > 0.7; 
  const level = xp < 100 ? 'Junior' : xp < 500 ? 'Senior' : 'God Mode';
  return `
    You are a FAANG Interviewer. Level: ${level}. Track: ${track}.
    Generate ONE challenge.
    {
      "mode": "${isInputMode ? 'input' : 'choice'}",
      "scenario": "Tricky context.",
      "code_snippet": "Code or N/A.",
      "question": "The question.",
      "options": ["A", "B", "C", "D"],
      "correct_answer": "Exact correct string",
      "explanation": "Expert analysis."
    }
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
  if (!config.api_key) throw new Error("MISSING_API_KEY");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);
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
    const data = await response.json();
    const content = data.choices[0].message.content;
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    const challenge = JSON.parse(content.substring(firstBrace, lastBrace + 1));
    if (challenge.mode === 'choice' && challenge.options) challenge.options = shuffleArray([...challenge.options]);
    return { challenge, source: config.name };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

export const fetchChallenge = async (track, xp) => {
  try { return await executeFetch(PROVIDERS.hf, track, xp); } 
  catch (err) {
    try { return await executeFetch(PROVIDERS.nvidia, track, xp); } 
    catch (err2) {
      try { return await executeFetch(PROVIDERS.groq, track, xp); } 
      catch (err3) { throw new Error("TOTAL_AI_SILENCE"); }
    }
  }
};

export const fetchGhostChallenge = async (failedEntry) => {
  const prompt = `System-memory recycler. Failed: "${failedEntry.question}". Generate mutated SAME concept. JSON required.`;
  try { return await executeFetch(PROVIDERS.groq, 'Ghost', 0, prompt); } 
  catch (err) { throw new Error("GHOST_FAILED"); }
};

export const fetchResearch = async (topic, question) => {
  const prompt = `CS Professor deep dive on: "${topic}" based on question: "${question}". Lecture note style.`;
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

export const verifyAnswer = async (question, correct, guess) => {
  const prompt = `Examiner: Is student guess "${guess}" semantically identical to "${correct}" for question "${question}"? JSON: {"is_correct": true/false, "feedback": "string"}`;
  try {
    const response = await fetch(PROVIDERS.groq.base_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PROVIDERS.groq.api_key}` },
      body: JSON.stringify({ model: PROVIDERS.groq.model, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    const content = data.choices[0].message.content;
    return JSON.parse(content.substring(content.indexOf('{'), content.lastIndexOf('}') + 1));
  } catch (err) { return { is_correct: guess.toLowerCase().trim() === correct.toLowerCase().trim(), feedback: "Offline" }; }
};
