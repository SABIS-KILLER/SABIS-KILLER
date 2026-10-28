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

// ── Mathematical Thinking & Verification Protocol System Instructions ────────
const MATHEMATICAL_THINKING_PROTOCOL =
  "You are an expert AI tutor specializing in advanced mathematics, statistics, computer science, and data analysis. Your primary goal is to provide 100% accurate solutions to questions extracted from user screenshots.\n\n" +
  "To eliminate mistakes, you MUST strictly execute this internal thinking and verification protocol in your background reasoning before generating the final output:\n\n" +
  "1. DATA EXTRACTION & VALIDATION:\n" +
  "   - Transcribe all text, numbers, and tabular data from the image exactly as written.\n" +
  "   - Inspect data structures immediately. For frequency tables: determine if class intervals are equal/unequal and whether classes are discrete or continuous. Convert discrete classes to continuous boundaries before calculating.\n\n" +
  "2. FORMULA RECALL & CONCEPT CHECK:\n" +
  "   - Explicitly verify statistical rules and formulas (e.g., Histograms: bar height = Frequency Density = Frequency ÷ Class Width when intervals are unequal; Modal Class = highest frequency density; Estimations = cumulative frequency & interpolation).\n\n" +
  "3. STEP-BY-STEP CALCULATION:\n" +
  "   - Execute every single calculation step internally. Construct internal working tables for hidden variables (Class Widths, Frequency Densities, Cumulative Frequencies) and verify intermediate arithmetic.\n\n" +
  "4. SANITY CHECK & DOUBLE VERIFICATION:\n" +
  "   - Re-read question text to confirm exact intent (e.g., 'above k' vs 'below k'). Verify that calculated answers are physically plausible within dataset boundaries and check against common pitfalls (e.g., raw frequency vs. density, continuous boundary adjustments).\n\n" +
  "======================================================================\n" +
  "OUTPUT & FORMATTING DIRECTIVES (STRICT):\n" +
  "======================================================================\n" +
  "- HIDDEN REASONING: Perform ALL steps of the verification protocol entirely behind the scenes. Do NOT output your internal thought process, formulas, tables, or intermediate calculations.\n" +
  "- MULTI-PART / MULTI-BLANK FORMATTING: Identify ALL parts, blanks, or drop-down menus in the question. Format the response clearly using question parts, on a single line where possible:\n" +
  "  Format Example: 'Q 1 part a: [Answer] part b: [Answer]' (or 'Q 1 part a: [Answer] Q 2 part a: [Answer]' for multi-question captures).\n" +
  "- ULTRA-CONCISE RESPONSE: Output ONLY the verified final answers with their corresponding labels. Do not include extra conversational filler.";

const HARDENED_SYSTEM_INSTRUCTION = MATHEMATICAL_THINKING_PROTOCOL;
const SYSTEM_PROMPT = MATHEMATICAL_THINKING_PROTOCOL;

const DEFAULT_USER_PROMPT =
  "Solve all academic/quiz questions visible in this screenshot according to instructions. " +
  "Execute the internal mathematical thinking protocol and output ONLY the verified final answers formatted as 'Q 1 part a: [Answer] part b: [Answer]'.";

const CUSTOM_SYSTEM_PROMPT =
  `${MATHEMATICAL_THINKING_PROTOCOL}\n\n` +
  "Task: Analyze the screenshot and answer ONLY the user's specific custom instruction.\n" +
  "1. Strictly focus on answering the user's prompt about what is visible on screen.\n" +
  "2. Execute the 4-step verification protocol internally before finalizing the answer.\n" +
  "3. Output ONLY the verified final answers formatted as 'Q 1 part a: [Answer] part b: [Answer]'. Zero conversational filler.";

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

// ── Canvas Image Pre-Processing Engine ─────────────────────────────────────────
async function preprocessScreenshotCanvas(dataUrl) {
  try {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
      return dataUrl;
    }

    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const sourceBitmap = await createImageBitmap(blob);

    const originalWidth = sourceBitmap.width;
    const originalHeight = sourceBitmap.height;

    // 1. Upscale low-res screen selections by 2x using bicubic Canvas rendering
    const targetWidth = originalWidth * 2;
    const targetHeight = originalHeight * 2;

    const offscreen = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!ctx) return dataUrl;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high'; // Bicubic rendering in Chromium

    // 2 & 3. Convert to high-contrast Grayscale and apply thresholding / contrast boosting
    ctx.filter = 'contrast(180%) brightness(105%) grayscale(100%)';
    ctx.drawImage(sourceBitmap, 0, 0, targetWidth, targetHeight);

    // Pixel-level high-contrast edge thresholding to sharpen dark text against light backgrounds
    try {
      const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        // Luminance
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const val = lum > 195 ? 255 : (lum < 75 ? 0 : lum);
        d[i] = val;
        d[i + 1] = val;
        d[i + 2] = val;
      }
      ctx.putImageData(imgData, 0, 0);
    } catch (_) {}

    const processedBlob = await offscreen.convertToBlob({ type: 'image/png' });
    const arrayBuffer = await processedBlob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize));
    }
    const preprocessedBase64 = btoa(binary);
    return `data:image/png;base64,${preprocessedBase64}`;
  } catch (err) {
    console.warn('[Image Pre-Processing Engine] Falling back to raw capture:', err);
    return dataUrl;
  }
}

// ── Hybrid OCR + Vision Prompt Builder ─────────────────────────────────────────
function buildHybridPrompt(extractedVerifiedText, customUserPrompt = '') {
  const verifiedTextContent = (extractedVerifiedText && extractedVerifiedText.trim())
    ? extractedVerifiedText.trim()
    : 'No text extracted. Extract and solve directly from visual screenshot context.';

  let prompt =
`VERIFIED OCR TEXT EXTRACTION:
${verifiedTextContent}

MATHEMATICAL & REASONING PROTOCOL:
You are an expert AI tutor. Using the exact OCR text provided above and the attached image for visual context, execute your internal verification protocol. Count data points, verify boundaries, and calculate step-by-step behind the scenes.

OUTPUT DIRECTIVE:
Do NOT output your reasoning or thought process. Output ONLY the verified final answer(s) on a single line formatted as: 'Q 1 part a: [Answer] part b: [Answer]'.`;

  if (customUserPrompt) {
    prompt += `\n\nUSER SPECIFIC INSTRUCTION:\n${customUserPrompt}`;
  }

  return prompt;
}

// ── Request Handler & Orchestrator ──────────────────────────────────────────
async function handleSolveRequest(sender, message) {
  const customPrompt = (message && typeof message.customPrompt === 'string') ? message.customPrompt.trim() : '';
  const clientExtractedText = (message && typeof message.extractedVerifiedText === 'string')
    ? message.extractedVerifiedText.trim()
    : '';

  const systemPrompt = customPrompt ? CUSTOM_SYSTEM_PROMPT : SYSTEM_PROMPT;
  const userPrompt = buildHybridPrompt(clientExtractedText, customPrompt);

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

  // Pass through Canvas Image Pre-Processing Engine (2x bicubic upscale, high-contrast grayscale, threshold boost)
  const processedDataUrl = await preprocessScreenshotCanvas(dataUrl);
  const base64Data = processedDataUrl.replace(/^data:image\/\w+;base64,/, '');

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
    thinking_summaries: "none",
    thinkingConfig: {
      thinking_summaries: "none"
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

  if (!response.ok && response.status === 400 && (data.error?.message?.includes('thinkingConfig') || data.error?.message?.includes('thinking_summaries'))) {
    delete payload.generationConfig.thinkingConfig;
    delete payload.generationConfig.thinking_summaries;
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

  // Filter out any internal reasoning / thought blocks from Gemini candidates
  const nonThoughtParts = (candidate.content?.parts || []).filter((p) => !p.thought && p.text);
  let text = nonThoughtParts.length > 0
    ? nonThoughtParts.map((p) => p.text).join('')
    : (candidate.content?.parts?.find((p) => p.text)?.text || '');

  // Strip XML/bracket reasoning tags and any leaked thought processes
  text = text
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^Thought:[\s\S]*?(?=\n\n|\n[A-Z0-9]|$)/i, '')
    .trim();

  if (!text) {
    return 'No response generated from screenshot.';
  }

  return text;
}
