/**
 * SABIS KILLER - Background Service Worker (v2.0)
 * Auto-Dynamic AI Routing Engine, Zero-Wait Recovery Cascade Matrix,
 * Client-Side SHA-256 Caching & Heuristic Task Classifier.
 */

// ── Hardened System Instructions ─────────────────────────────────────────────
const HARDENED_SYSTEM_INSTRUCTION =
  "You are an elite academic and technical reasoning assistant. Your goal is 100% factual and logical precision. " +
  "Directives: " +
  "1. Answer concisely without conversational filler. " +
  "2. For math/physics, use exact LaTeX formatting and verify calculations internally before returning final values. " +
  "3. For code, ensure syntactically valid code blocks. " +
  "4. If information is ambiguous, provide the most logically rigorous interpretation.";

const SYSTEM_PROMPT =
  `${HARDENED_SYSTEM_INSTRUCTION}\n\n` +
  "Task: Analyze the quiz/test screenshot carefully and output ONLY the ultra-concise final answers:\n" +
  "- DOUBLE-CHECK & VERIFY: You MUST thoroughly recheck each calculation, step, and answer to ensure 100% accuracy.\n" +
  "- Answer EVERY question and blank visible on screen without omission.\n" +
  "- FORMAT: Organize by section/part separated by pipe characters (|).\n" +
  "- For fill-in-the-blank: 'Blank 1: [Answer], Blank 2: [Answer]'.\n" +
  "- For multiple choice / questions: 'Question 1: [Answer]'.\n" +
  "- Keep output direct, clean, and plain for maximum legibility on a screen overlay.";

const DEFAULT_USER_PROMPT =
  "Solve all academic/quiz questions visible in this screenshot according to instructions. " +
  "Recheck your answers and double-check each method and step used for complete accuracy.";

const CUSTOM_SYSTEM_PROMPT =
  `${HARDENED_SYSTEM_INSTRUCTION}\n\n` +
  "Task: Analyze the screenshot and answer ONLY the user's specific custom instruction.\n" +
  "1. Strictly focus on answering the user's prompt about what is visible on screen.\n" +
  "2. Double-check each method and step to guarantee 100% accuracy.\n" +
  "3. Answer concisely and directly with zero conversational filler.\n" +
  "4. Plain text only: no conversational filler, greetings, or sign-offs.";

const GEMINI_MODELS_CATALOG = {
  'gemini-3.8-flash':      { tier: 'paid', fallback: 'gemini-3.7-flash' },
  'gemini-3.8-flash-lite': { tier: 'paid', fallback: 'gemini-3.6-flash-lite' },
  'gemini-3.7-flash':      { tier: 'paid', fallback: 'gemini-3.6-flash' },
  'gemini-3.7-flash-lite': { tier: 'paid', fallback: 'gemini-3.6-flash-lite' },
  'gemini-3.6-flash':      { tier: 'free', fallback: 'gemini-3.5-flash-lite' },
  'gemini-3.6-flash-lite': { tier: 'free', fallback: 'gemini-3.5-flash-lite' },
  'gemini-3.5-flash':      { tier: 'free', fallback: 'gemini-3.5-flash-lite' },
  'gemini-3.5-flash-lite': { tier: 'free', fallback: 'gemini-2.5-flash' },
  'gemini-2.5-flash':      { tier: 'free', fallback: 'gemini-2.5-pro' }
};

const PROVIDER_NAMES = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter'
};

// ── 1. Client-Side Edge Pre-Processing & Heuristic Task Classifier ───────────
function isComplexTask(prompt) {
  if (!prompt || typeof prompt !== 'string') return false;
  const text = prompt.trim();
  const lower = text.toLowerCase();

  // c. High Context / Length: Prompts exceeding 400 characters OR multi-step keywords
  if (text.length > 400) return true;
  const multiStepKeywords = [
    'explain step by step', 'step by step', 'verify accuracy', 'compare',
    'deep analysis', 'double check', 'recheck', 'multi-step', 'show work',
    'detailed explanation', 'proof', 'prove that'
  ];
  for (const kw of multiStepKeywords) {
    if (lower.includes(kw)) return true;
  }

  // a. Math & STEM Syntax: \int, \sum, \sqrt, d/dx, \matrix, fractions, problem-solving directives
  const mathSymbols = [
    '\\int', '∫', '\\sum', '∑', '\\sqrt', '√', 'd/dx', '\\matrix', '\\frac',
    '∂', 'lim', 'matrix', 'matrices', 'calculus', 'integral', 'derivative'
  ];
  for (const s of mathSymbols) {
    if (lower.includes(s)) return true;
  }
  if (/\b(solve\s+for|evaluate|derive|prove|integrate|differentiate|eigenvalue|polynomial|determinant|quadratic|fraction)\b/i.test(text)) {
    return true;
  }
  if (/[0-9a-zA-Z]\s*[\^]\s*[0-9]/.test(text) || /\b\d+\s*\/\s*\d+\b/.test(text)) {
    return true;
  }

  // b. Code & Technical Syntax: function, class, import, const, def, async, return, SQL queries, backtick code blocks
  const codeKeywords = [
    'function', 'class', 'import', 'const', 'let', 'var', 'def', 'async',
    'return', 'select', 'insert', 'update', 'delete', 'from', 'where', 'join',
    'console.log', 'git', 'refactor', 'lambda'
  ];
  const codeRegex = new RegExp(`\\b(${codeKeywords.join('|')})\\b`, 'i');
  if (codeRegex.test(text)) return true;
  if (text.includes('```') || text.includes('`') || /\{[\s\S]*;[\s\S]*\}/.test(text) || /=>\s*\{/.test(text)) {
    return true;
  }

  return false;
}

// ── SHA-256 Hashing & Instant Cache Check (<1ms / 0ms API Latency) ───────────
async function computeSha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkCache(hash) {
  try {
    const data = await chrome.storage.local.get(['ai_query_cache']);
    const cache = data.ai_query_cache || {};
    const entry = cache[hash];
    if (entry && (Date.now() - entry.timestamp < 24 * 60 * 60 * 1000)) {
      console.log('[Cache Hit] Instant 0ms cached result for hash:', hash.slice(0, 16));
      return entry;
    }
  } catch (err) {
    console.warn('[Cache Error]:', err);
  }
  return null;
}

async function writeCache(hash, result) {
  try {
    const data = await chrome.storage.local.get(['ai_query_cache']);
    const cache = data.ai_query_cache || {};
    const now = Date.now();
    // Prune entries older than 24 hours
    for (const key in cache) {
      if (now - cache[key].timestamp > 24 * 60 * 60 * 1000) {
        delete cache[key];
      }
    }
    // Maintain maximum 150 items
    const keys = Object.keys(cache);
    if (keys.length > 150) {
      delete cache[keys[0]];
    }
    cache[hash] = {
      timestamp: now,
      answer: result.answer,
      modelUsed: result.modelUsed,
      modeActive: result.modeActive,
      wasFallbackTriggered: result.wasFallbackTriggered || false
    };
    await chrome.storage.local.set({ ai_query_cache: cache });
  } catch (err) {
    console.warn('[Cache Save Error]:', err);
  }
}

// ── Message Listener ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'SOLVE_SCREEN') {
    handleSolveRequest(sender, message)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error.message || 'An unexpected error occurred.'
        });
      });
    return true;
  }
});

// ── Request Handler & Orchestrator ──────────────────────────────────────────
async function handleSolveRequest(sender, message) {
  const customPrompt = (message && typeof message.customPrompt === 'string') ? message.customPrompt.trim() : '';
  const systemPrompt = customPrompt ? CUSTOM_SYSTEM_PROMPT : SYSTEM_PROMPT;
  const userPrompt = customPrompt
    ? `USER INSTRUCTION: ${customPrompt}\n\nAnalyze the screenshot and answer ONLY the user instruction above in the simplest way possible without anything extra.`
    : DEFAULT_USER_PROMPT;

  const storage = await chrome.storage.local.get([
    'ai_provider', 'active_provider',
    'GEMINI_API_KEY', 'geminiApiKey', 'gemini_model', 'geminiModel',
    'OPENAI_API_KEY', 'openai_model',
    'ANTHROPIC_API_KEY', 'anthropic_model',
    'DEEPSEEK_API_KEY', 'deepseek_model',
    'OPENROUTER_API_KEY', 'openrouter_model'
  ]);

  const activeProvider = storage.ai_provider || storage.active_provider || 'gemini';
  const providerName = PROVIDER_NAMES[activeProvider] || 'AI Provider';

  let apiKey = '';
  let modelMode = '';

  if (activeProvider === 'gemini') {
    apiKey = (storage.GEMINI_API_KEY || storage.geminiApiKey || '').trim();
    modelMode = storage.gemini_model || storage.geminiModel || 'auto_dynamic_paid';
  } else if (activeProvider === 'openai') {
    apiKey = (storage.OPENAI_API_KEY || '').trim();
    modelMode = storage.openai_model || 'auto_dynamic_paid';
  } else if (activeProvider === 'anthropic') {
    apiKey = (storage.ANTHROPIC_API_KEY || '').trim();
    modelMode = storage.anthropic_model || 'auto_paid';
  } else if (activeProvider === 'deepseek') {
    apiKey = (storage.DEEPSEEK_API_KEY || '').trim();
    modelMode = storage.deepseek_model || 'auto_free';
  } else if (activeProvider === 'openrouter') {
    apiKey = (storage.OPENROUTER_API_KEY || '').trim();
    modelMode = storage.openrouter_model || 'auto_free';
  }

  // 4. API Key Sanitization & Validation
  if (!apiKey || apiKey.length < 5) {
    return {
      success: false,
      error: `Please save your ${providerName} API Key in the extension popup.`
    };
  }

  const errStr = (e) => {
    if (!e) return 'Unknown error';
    if (typeof e === 'string') return e;
    if (e.message) return e.message;
    try { return JSON.stringify(e); } catch (_) { return String(e); }
  };

  // Screen capture
  let dataUrl = null;
  let captureError = 'No capture strategy succeeded';

  const senderWindowId = sender?.tab?.windowId;
  if (senderWindowId != null) {
    try {
      dataUrl = await chrome.tabs.captureVisibleTab(senderWindowId, { format: 'png' });
    } catch (e) {
      captureError = errStr(e.message || e);
    }
  }

  if (!dataUrl) {
    try {
      dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    } catch (e) {
      captureError = errStr(e.message || e);
    }
  }

  if (!dataUrl) {
    try {
      const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'], populate: false });
      if (win && win.id) {
        dataUrl = await chrome.tabs.captureVisibleTab(win.id, { format: 'png' });
      }
    } catch (e) {
      captureError = errStr(e.message || e);
    }
  }

  if (!dataUrl) {
    return {
      success: false,
      error: `Screen capture failed: ${captureError}. Make sure the tab is active and not a restricted page.`
    };
  }

  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');

  // 1. Instant Cache Check (<1ms Latency)
  const payloadToHash = `${userPrompt}:::${base64Data}`;
  const requestHash = await computeSha256(payloadToHash);
  const cachedResult = await checkCache(requestHash);

  // Classification
  const promptForHeuristic = customPrompt || userPrompt || '';
  const isComplex = isComplexTask(promptForHeuristic);
  const taskComplexity = isComplex ? 'HIGH_COMPLEXITY' : 'LIGHTWEIGHT';

  if (cachedResult) {
    console.log("[Auto-Dynamic Router] Task:", taskComplexity, "| Model Executed:", cachedResult.modelUsed, "| Latency:", 0, "ms | Fallback Triggered:", false);
    return {
      success: true,
      answer: cachedResult.answer,
      response: cachedResult.answer,
      modelUsed: `${cachedResult.modelUsed} [Cache Hit]`,
      modeActive: cachedResult.modeActive,
      wasFallbackTriggered: false,
      fromCache: true
    };
  }

  // Execute routing with latency metric tracking
  const startTime = performance.now();
  try {
    const result = await routeProviderRequest(
      activeProvider,
      apiKey,
      modelMode,
      base64Data,
      systemPrompt,
      userPrompt,
      customPrompt,
      isComplex,
      taskComplexity
    );

    const executionTimeMs = Math.round(performance.now() - startTime);

    // 4. Log exact metrics to console
    console.log(
      "[Auto-Dynamic Router] Task:", taskComplexity,
      "| Model Executed:", result.modelUsed,
      "| Latency:", executionTimeMs,
      "ms | Fallback Triggered:", result.wasFallbackTriggered || false
    );

    // Save result to cache
    await writeCache(requestHash, result);

    return {
      success: true,
      answer: result.answer,
      response: result.answer,
      modelUsed: result.modelUsed,
      modeActive: result.modeActive,
      wasFallbackTriggered: result.wasFallbackTriggered || false
    };
  } catch (err) {
    const errorDetails = errStr(err.message || err);
    return {
      success: false,
      error: `${providerName} error: ${errorDetails}`
    };
  }
}

function isQuotaOrRateLimitError(err) {
  if (!err) return false;
  if (err.status === 429 || err.status === 402 || err.status === 503 || err.status === 504) return true;
  const msg = (err.message || String(err)).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('too many requests') ||
    msg.includes('resource exhausted') ||
    msg.includes('insufficient_quota') ||
    msg.includes('credit') ||
    msg.includes('payment') ||
    msg.includes('overloaded') ||
    msg.includes('high demand')
  );
}

// ── Provider Routing Dispatcher ─────────────────────────────────────────────
async function routeProviderRequest(
  provider,
  apiKey,
  modelMode,
  base64Data,
  systemPrompt,
  userPrompt,
  customPrompt,
  isComplex,
  taskComplexity
) {
  switch (provider) {
    case 'gemini':
      return handleGeminiRouting(apiKey, modelMode, base64Data, systemPrompt, userPrompt, isComplex, taskComplexity);
    case 'openai':
      return handleOpenAIRouting(apiKey, modelMode, base64Data, systemPrompt, userPrompt, isComplex);
    case 'anthropic':
      return handleAnthropicRouting(apiKey, modelMode, base64Data, systemPrompt, userPrompt, isComplex);
    case 'deepseek':
      return handleDeepSeekRouting(apiKey, modelMode, base64Data, systemPrompt, userPrompt, isComplex);
    case 'openrouter':
      return handleOpenRouterRouting(apiKey, modelMode, base64Data, systemPrompt, userPrompt, isComplex);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

// ── 2. Backend Routing Engine & Zero-Wait Recovery Cascade Matrix ────────────
async function handleGeminiRouting(
  apiKey,
  modelMode,
  base64Data,
  systemPrompt,
  userPrompt,
  isComplex,
  taskComplexity
) {
  let currentMode = modelMode;
  if (currentMode === 'auto_paid') currentMode = 'auto_dynamic_paid';
  if (currentMode === 'auto_free' || currentMode === 'auto') currentMode = 'auto_dynamic_free';

  let cascadeList = [];

  if (currentMode === 'auto_dynamic_paid') {
    if (taskComplexity === 'HIGH_COMPLEXITY') {
      // Paid High Complexity Primary: gemini-3.8-flash -> Fallback 1: gemini-3.7-flash -> Fallback 2: gemini-3.6-flash
      cascadeList = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'];
    } else {
      // Paid Lightweight Primary: gemini-3.8-flash-lite -> Fallback 1: gemini-3.6-flash-lite -> Fallback 2: gemini-3.5-flash-lite
      cascadeList = ['gemini-3.8-flash-lite', 'gemini-3.6-flash-lite', 'gemini-3.5-flash-lite'];
    }
  } else if (currentMode === 'auto_dynamic_free') {
    // Free Tier Matrix: gemini-3.6-flash -> Fallback: gemini-3.5-flash-lite
    cascadeList = isComplex
      ? ['gemini-3.6-flash', 'gemini-3.5-flash-lite']
      : ['gemini-3.5-flash-lite', 'gemini-3.6-flash'];
  } else {
    // Manual model mode
    let manualModel = modelMode || 'gemini-3.8-flash';
    const fallback = GEMINI_MODELS_CATALOG[manualModel]?.fallback || 'gemini-3.5-flash-lite';
    cascadeList = [manualModel, fallback];
  }

  let lastErr = null;

  for (let i = 0; i < cascadeList.length; i++) {
    const candidateModel = cascadeList[i];
    const isFallback = (i > 0);

    try {
      const answer = await callGeminiAPI(apiKey, candidateModel, base64Data, systemPrompt, userPrompt, isComplex);
      return {
        answer,
        response: answer,
        modelUsed: candidateModel,
        modeActive: currentMode,
        wasFallbackTriggered: isFallback
      };
    } catch (err) {
      lastErr = err;
      const isRecoverable = (
        err.status === 429 ||
        err.status === 503 ||
        err.status === 504 ||
        err.status === 404 ||
        err.name === 'AbortError' ||
        isQuotaOrRateLimitError(err)
      );

      if (isRecoverable && i < cascadeList.length - 1) {
        console.warn(`[Auto-Dynamic Router] ${candidateModel} failed (${err.message}). Instant failover (<50ms) to ${cascadeList[i + 1]}...`);
        continue;
      }
      throw err;
    }
  }

  throw lastErr || new Error('All models in recovery cascade matrix failed.');
}

// ── 3. Zero-Latency Accuracy Boosters & Deterministic Hyperparameters ────────
async function callGeminiAPI(apiKey, model, base64Image, systemPrompt = SYSTEM_PROMPT, userPrompt = DEFAULT_USER_PROMPT, isComplex = false) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  // Deterministic hyperparameter tuning by task
  const generationConfig = {
    temperature: isComplex ? 0.0 : 0.2,
    topP: isComplex ? 0.1 : 0.8,
    maxOutputTokens: 2048,
    thinkingConfig: {
      thinkingLevel: isComplex ? "high" : "minimal"
    }
  };
  if (isComplex) {
    generationConfig.topK = 1;
  }

  const payload = {
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: [
      {
        role: 'user',
        parts: [
          { text: userPrompt },
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Image
            }
          }
        ]
      }
    ],
    generationConfig
  };

  // 6-second timeout via AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (netErr) {
    clearTimeout(timeoutId);
    if (netErr.name === 'AbortError') {
      const err = new Error(`Request timed out after 6 seconds for ${model}`);
      err.status = 504;
      throw err;
    }
    throw netErr;
  } finally {
    clearTimeout(timeoutId);
  }

  let data = await response.json().catch(() => ({}));

  // Resilient thinkingConfig retry for older or non-thinking model endpoints
  if (!response.ok && response.status === 400 && data.error?.message?.includes('thinkingConfig')) {
    delete payload.generationConfig.thinkingConfig;
    const retryController = new AbortController();
    const retryTimeoutId = setTimeout(() => retryController.abort(), 6000);
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: retryController.signal
      });
      data = await response.json().catch(() => ({}));
    } finally {
      clearTimeout(retryTimeoutId);
    }
  }

  if (!response.ok) {
    const err = new Error(data.error?.message || `HTTP ${response.status}: Failed to generate content`);
    err.status = response.status;
    throw err;
  }

  const candidate = data.candidates?.[0];
  if (!candidate) {
    if (data.promptFeedback?.blockReason) {
      throw new Error(`Generation blocked: ${data.promptFeedback.blockReason}`);
    }
    return 'No response generated.';
  }

  const textPart = candidate.content?.parts?.find((p) => p.text)?.text;
  if (!textPart || !textPart.trim()) {
    return 'No response generated from screenshot.';
  }

  return textPart.trim();
}

async function callOpenAIAPI(apiKey, model, base64Image, systemPrompt = SYSTEM_PROMPT, userPrompt = DEFAULT_USER_PROMPT, isComplex = false) {
  const isReasoning = model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4');

  const messages = isReasoning
    ? [
        {
          role: 'user',
          content: [
            { type: 'text', text: `${systemPrompt}\n\n${userPrompt}` },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
          ]
        }
      ]
    : [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
          ]
        }
      ];

  const payload = {
    model: model,
    messages: messages
  };

  if (isReasoning) {
    payload.max_completion_tokens = 2048;
  } else {
    payload.max_tokens = 2048;
    payload.temperature = isComplex ? 0.0 : 0.2;
    payload.top_p = isComplex ? 0.1 : 0.8;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  let response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (netErr) {
    clearTimeout(timeoutId);
    if (netErr.name === 'AbortError') {
      const err = new Error(`OpenAI request timed out after 6 seconds for ${model}`);
      err.status = 504;
      throw err;
    }
    throw netErr;
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data.error?.message || `HTTP ${response.status}: OpenAI request failed`);
    err.status = response.status;
    throw err;
  }

  const answer = data.choices?.[0]?.message?.content;
  if (!answer || !answer.trim()) {
    return 'No response generated from OpenAI.';
  }

  return answer.trim();
}

async function handleOpenAIRouting(apiKey, modelMode, base64Data, systemPrompt, userPrompt, isComplex) {
  if (modelMode === 'auto_free') {
    try {
      const ans = await callOpenAIAPI(apiKey, 'gpt-5.4-mini', base64Data, systemPrompt, userPrompt, isComplex);
      return { answer: ans, modelUsed: 'gpt-5.4-mini', wasFallbackTriggered: false };
    } catch (err) {
      console.warn('gpt-5.4-mini failover to gpt-4o-mini');
      const ans = await callOpenAIAPI(apiKey, 'gpt-4o-mini', base64Data, systemPrompt, userPrompt, isComplex);
      return { answer: ans, modelUsed: 'gpt-4o-mini', wasFallbackTriggered: true };
    }
  } else if (modelMode === 'auto_paid' || modelMode === 'auto_dynamic_paid') {
    const primary = isComplex ? 'gpt-5.4' : 'gpt-5.4-mini';
    try {
      const ans = await callOpenAIAPI(apiKey, primary, base64Data, systemPrompt, userPrompt, isComplex);
      return { answer: ans, modelUsed: primary, wasFallbackTriggered: false };
    } catch (err) {
      if (isQuotaOrRateLimitError(err) || err.status === 404) {
        console.warn(`${primary} failover to gpt-4o-mini`);
        const ans = await callOpenAIAPI(apiKey, 'gpt-4o-mini', base64Data, systemPrompt, userPrompt, isComplex);
        return { answer: ans, modelUsed: 'gpt-4o-mini', wasFallbackTriggered: true };
      }
      throw err;
    }
  } else {
    const ans = await callOpenAIAPI(apiKey, modelMode, base64Data, systemPrompt, userPrompt, isComplex);
    return { answer: ans, modelUsed: modelMode, wasFallbackTriggered: false };
  }
}

async function callAnthropicAPI(apiKey, model, base64Image, systemPrompt = SYSTEM_PROMPT, userPrompt = DEFAULT_USER_PROMPT, isComplex = false) {
  let resolvedModel = model;
  if (model === 'claude-3-5-sonnet') resolvedModel = 'claude-3-5-sonnet-20241022';
  else if (model === 'claude-3-5-haiku') resolvedModel = 'claude-3-5-haiku-20241022';
  else if (model === 'claude-3-opus') resolvedModel = 'claude-3-opus-20240229';

  const payload = {
    model: resolvedModel,
    system: systemPrompt,
    max_tokens: 2048,
    temperature: isComplex ? 0.0 : 0.2,
    top_p: isComplex ? 0.1 : 0.8,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64Image
            }
          },
          {
            type: 'text',
            text: userPrompt
          }
        ]
      }
    ]
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (netErr) {
    clearTimeout(timeoutId);
    if (netErr.name === 'AbortError') {
      const err = new Error(`Anthropic request timed out after 6 seconds for ${model}`);
      err.status = 504;
      throw err;
    }
    throw netErr;
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data.error?.message || `HTTP ${response.status}: Anthropic request failed`);
    err.status = response.status;
    throw err;
  }

  const textBlock = data.content?.find((c) => c.type === 'text');
  if (!textBlock || !textBlock.text.trim()) {
    return 'No response generated from Anthropic.';
  }

  return textBlock.text.trim();
}

async function handleAnthropicRouting(apiKey, modelMode, base64Data, systemPrompt, userPrompt, isComplex) {
  if (modelMode === 'auto_paid') {
    const primary = isComplex ? 'claude-3-5-sonnet-20241022' : 'claude-3-5-haiku-20241022';
    try {
      const ans = await callAnthropicAPI(apiKey, primary, base64Data, systemPrompt, userPrompt, isComplex);
      return { answer: ans, modelUsed: primary, wasFallbackTriggered: false };
    } catch (err) {
      if (isQuotaOrRateLimitError(err) || err.status === 404) {
        console.warn(`${primary} failover to claude-3-5-haiku-20241022`);
        const ans = await callAnthropicAPI(apiKey, 'claude-3-5-haiku-20241022', base64Data, systemPrompt, userPrompt, isComplex);
        return { answer: ans, modelUsed: 'claude-3-5-haiku-20241022', wasFallbackTriggered: true };
      }
      throw err;
    }
  } else {
    const ans = await callAnthropicAPI(apiKey, modelMode, base64Data, systemPrompt, userPrompt, isComplex);
    return { answer: ans, modelUsed: modelMode, wasFallbackTriggered: false };
  }
}

async function callDeepSeekAPI(apiKey, model, base64Image, systemPrompt = SYSTEM_PROMPT, userPrompt = DEFAULT_USER_PROMPT, isComplex = false) {
  const payload = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
        ]
      }
    ],
    max_tokens: 2048,
    temperature: isComplex ? 0.0 : 0.2,
    top_p: isComplex ? 0.1 : 0.8
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  let response;
  try {
    response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (netErr) {
    clearTimeout(timeoutId);
    if (netErr.name === 'AbortError') {
      const err = new Error(`DeepSeek request timed out after 6 seconds for ${model}`);
      err.status = 504;
      throw err;
    }
    throw netErr;
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data.error?.message || `HTTP ${response.status}: DeepSeek request failed`);
    err.status = response.status;
    throw err;
  }

  const answer = data.choices?.[0]?.message?.content;
  if (!answer || !answer.trim()) {
    return 'No response generated from DeepSeek.';
  }

  return answer.trim();
}

async function handleDeepSeekRouting(apiKey, modelMode, base64Data, systemPrompt, userPrompt, isComplex) {
  const targetModel = modelMode === 'auto_free' ? 'deepseek-chat' : modelMode;
  try {
    const ans = await callDeepSeekAPI(apiKey, targetModel, base64Data, systemPrompt, userPrompt, isComplex);
    return { answer: ans, modelUsed: targetModel, wasFallbackTriggered: false };
  } catch (err) {
    if (targetModel !== 'deepseek-chat' && (isQuotaOrRateLimitError(err) || err.status === 404)) {
      console.warn(`${targetModel} failover to deepseek-chat`);
      const ans = await callDeepSeekAPI(apiKey, 'deepseek-chat', base64Data, systemPrompt, userPrompt, isComplex);
      return { answer: ans, modelUsed: 'deepseek-chat', wasFallbackTriggered: true };
    }
    throw err;
  }
}

async function callOpenRouterAPI(apiKey, model, base64Image, systemPrompt = SYSTEM_PROMPT, userPrompt = DEFAULT_USER_PROMPT, isComplex = false) {
  const payload = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
        ]
      }
    ],
    max_tokens: 2048,
    temperature: isComplex ? 0.0 : 0.2,
    top_p: isComplex ? 0.1 : 0.8
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  let response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (netErr) {
    clearTimeout(timeoutId);
    if (netErr.name === 'AbortError') {
      const err = new Error(`OpenRouter request timed out after 6 seconds for ${model}`);
      err.status = 504;
      throw err;
    }
    throw netErr;
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data.error?.message || `HTTP ${response.status}: OpenRouter request failed`);
    err.status = response.status;
    throw err;
  }

  const answer = data.choices?.[0]?.message?.content;
  if (!answer || !answer.trim()) {
    return 'No response generated from OpenRouter.';
  }

  return answer.trim();
}

async function handleOpenRouterRouting(apiKey, modelMode, base64Data, systemPrompt, userPrompt, isComplex) {
  const freeVariants = [
    'openrouter/free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemini-2.5-flash:free'
  ];

  if (modelMode === 'auto_free') {
    for (let i = 0; i < freeVariants.length; i++) {
      try {
        const ans = await callOpenRouterAPI(apiKey, freeVariants[i], base64Data, systemPrompt, userPrompt, isComplex);
        return { answer: ans, modelUsed: freeVariants[i], wasFallbackTriggered: i > 0 };
      } catch (err) {
        if (i < freeVariants.length - 1) continue;
        throw err;
      }
    }
  } else if (modelMode === 'auto_paid') {
    try {
      const ans = await callOpenRouterAPI(apiKey, 'openrouter/auto', base64Data, systemPrompt, userPrompt, isComplex);
      return { answer: ans, modelUsed: 'openrouter/auto', wasFallbackTriggered: false };
    } catch (err) {
      if (isQuotaOrRateLimitError(err) || err.status === 404) {
        console.warn('openrouter/auto failover to openrouter/free');
        const ans = await callOpenRouterAPI(apiKey, 'openrouter/free', base64Data, systemPrompt, userPrompt, isComplex);
        return { answer: ans, modelUsed: 'openrouter/free', wasFallbackTriggered: true };
      }
      throw err;
    }
  } else {
    const ans = await callOpenRouterAPI(apiKey, modelMode, base64Data, systemPrompt, userPrompt, isComplex);
    return { answer: ans, modelUsed: modelMode, wasFallbackTriggered: false };
  }
}
