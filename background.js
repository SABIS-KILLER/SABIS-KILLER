/**
 * SABIS KILLER - Background Service Worker (v2.0)
 * Intercepts toolbar icon clicks to trigger the custom in-page centered modal,
 * routes single Auto-Dynamic Model Picker, handles failover cascades,
 * and maintains SHA-256 edge caching.
 */

// ── Intercept Toolbar Action Click ───────────────────────────────────────────
chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.id) return;
  const url = tab.url || '';
  if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
    return;
  }

  chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_SETTINGS_MODAL' }, (response) => {
    const err = chrome.runtime.lastError;
    if (err || !response) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }).then(() => {
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_SETTINGS_MODAL' }, () => {
            void chrome.runtime.lastError;
          });
        }, 120);
      }).catch(() => {});
    }
  });
});

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

const GEMINI_FREE_TIER_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash'
];

const GEMINI_MODELS_CATALOG = {
  'gemini-3.8-flash':      { fallback: 'gemini-3.6-flash' },
  'gemini-3.6-flash':      { fallback: 'gemini-3.5-flash-lite' },
  'gemini-3.5-flash-lite': { fallback: 'gemini-3.1-flash-lite' },
  'gemini-3.1-flash-lite': { fallback: 'gemini-2.5-flash' },
  'gemini-2.5-flash':      { fallback: 'gemini-3.8-flash' }
};

const PROVIDER_NAMES = {
  gemini: 'Google AI Studio'
};

// ── 1. Client-Side Edge Pre-Processing & Heuristic Task Classifier ───────────
function isComplexTask(prompt) {
  if (!prompt || typeof prompt !== 'string') return false;
  const text = prompt.trim();
  const lower = text.toLowerCase();

  // High Context / Length: Prompts exceeding 400 characters OR multi-step keywords
  if (text.length > 400) return true;
  const multiStepKeywords = [
    'explain step by step', 'step by step', 'verify accuracy', 'compare',
    'deep analysis', 'double check', 'recheck', 'multi-step', 'show work',
    'detailed explanation', 'proof', 'prove that'
  ];
  for (const kw of multiStepKeywords) {
    if (lower.includes(kw)) return true;
  }

  // Math & STEM Syntax
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

  // Code & Technical Syntax
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
    for (const key in cache) {
      if (now - cache[key].timestamp > 24 * 60 * 60 * 1000) {
        delete cache[key];
      }
    }
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
    'GEMINI_API_KEY', 'geminiApiKey', 'gemini_model', 'geminiModel'
  ]);

  const apiKey = (storage.GEMINI_API_KEY || storage.geminiApiKey || '').trim();
  const modelMode = storage.gemini_model || storage.geminiModel || 'auto_dynamic';

  // API Key Sanitization & Validation
  if (!apiKey || apiKey.length < 5) {
    return {
      success: false,
      error: 'Please save your Google AI Studio Gemini API Key in the settings panel.'
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

  // Instant Cache Check (<1ms Latency)
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

    console.log(
      "[Auto-Dynamic Router] Task:", taskComplexity,
      "| Model Executed:", result.modelUsed,
      "| Latency:", executionTimeMs,
      "ms | Fallback Triggered:", result.wasFallbackTriggered || false
    );

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
      error: `Google AI Studio error: ${errorDetails}`
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
  apiKey,
  modelMode,
  base64Data,
  systemPrompt,
  userPrompt,
  customPrompt,
  isComplex,
  taskComplexity
) {
  return handleGeminiRouting(apiKey, modelMode, base64Data, systemPrompt, userPrompt, isComplex, taskComplexity);
}

// ── Single Auto-Dynamic Model Picker & Zero-Wait Recovery Cascade Matrix ─────
async function handleGeminiRouting(
  apiKey,
  modelMode,
  base64Data,
  systemPrompt,
  userPrompt,
  isComplex,
  taskComplexity
) {
  let currentMode = modelMode || 'auto_dynamic';
  const isAuto = !currentMode || currentMode === 'auto_dynamic' || currentMode.startsWith('auto');

  let cascadeList = [];

  if (isAuto) {
    // Dynamic cycle through verified Google AI Studio free tier models:
    // gemini-3.8-flash -> gemini-3.6-flash -> gemini-3.5-flash-lite -> gemini-3.1-flash-lite -> gemini-2.5-flash
    cascadeList = [
      'gemini-3.8-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash'
    ];
  } else {
    // Manual model selection with cascade failover through remaining free tier models
    const selectedModel = currentMode;
    const remaining = GEMINI_FREE_TIER_MODELS.filter(m => m !== selectedModel);
    cascadeList = [selectedModel, ...remaining];
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
      if (i < cascadeList.length - 1) {
        console.warn(`[Auto-Dynamic Router] ${candidateModel} failed (${err.message}). Instant failover (<50ms) to ${cascadeList[i + 1]}...`);
        continue;
      }
      throw err;
    }
  }

  throw lastErr || new Error('All Google AI Studio free-tier models failed.');
}

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

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (netErr) {
    throw netErr;
  }

  let data = await response.json().catch(() => ({}));

  if (!response.ok && response.status === 400 && data.error?.message?.includes('thinkingConfig')) {
    delete payload.generationConfig.thinkingConfig;
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    data = await response.json().catch(() => ({}));
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
