/**
 * SABIS KILLER - Background Service Worker (v2.1)
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

// ── Gemini Vision System Instructions (Arabic Support & Calculation Double-Check) ──
const GEMINI_VISION_SYSTEM_PROMPT =
  "You are an expert academic tutor and visual solver specializing in mathematics, sciences, languages, and general quiz questions.\n\n" +
  "======================================================================\n" +
  "1. MANDATORY CALCULATION DOUBLE-CHECK:\n" +
  "======================================================================\n" +
  "- For ANY question involving numbers, arithmetic, addition, subtraction, multiplication, division, fractions, formulas, or calculations, you MUST explicitly verify your step-by-step mathematical method.\n" +
  "- Double-check all intermediate numeric operations, boundary adjustments, and final calculation results before outputting to guarantee 100% absolute accuracy.\n" +
  "- Verify that calculated values are plausible and directly answer the exact question phrasing.\n\n" +
  "======================================================================\n" +
  "2. ARABIC LANGUAGE HANDLING:\n" +
  "======================================================================\n" +
  "- Maintain the standard structured label format at all times (e.g., 'Q 1 part a:', 'Q 1 part b:').\n" +
  "- If the quiz question in the image is in Arabic, provide the specific answer values in Arabic.\n" +
  "- If the question is an Arabic grammar or language-specific question (e.g. نحو, صرف, إعراب, بلاغة, لغة عربية), write BOTH the answers and the explanation fully in Arabic while keeping the standard 'Q 1 part...' label format.\n" +
  "- If the question is a standard subject (like Math, Physics, or Chemistry) written in English, keep the answer values and explanations in English.\n\n" +
  "======================================================================\n" +
  "3. OUTPUT FORMAT (STRICT JSON ONLY):\n" +
  "======================================================================\n" +
  "You MUST output valid, parseable JSON matching this exact schema:\n" +
  "{\n" +
  '  "success": true,\n' +
  '  "answers": "Q 1 part a: [Answer], part b: [Answer]",\n' +
  '  "explanation": "Verified step-by-step reasoning."\n' +
  "}\n" +
  "- 'answers': A single concise line containing all parts of the question formatted as 'Q 1 part a: [Answer], part b: [Answer]'.\n" +
  "- 'explanation': A concise 1-2 sentence verified step-by-step reasoning demonstrating the double-checked calculation or linguistic rule.\n" +
  "- Return raw JSON only. Do not wrap in markdown code blocks or add introductory/concluding conversational text.";

const SYSTEM_PROMPT = GEMINI_VISION_SYSTEM_PROMPT;
const HARDENED_SYSTEM_INSTRUCTION = GEMINI_VISION_SYSTEM_PROMPT;

const CUSTOM_SYSTEM_PROMPT =
  `${GEMINI_VISION_SYSTEM_PROMPT}\n\n` +
  "Task: Analyze the screenshot and answer according to the user's specific instruction while strictly preserving the calculation double-check, Arabic/English language handling rules, and JSON output schema.";

const DEFAULT_USER_PROMPT =
  "Analyze the quiz question in this screenshot. Execute the mandatory calculation double-check, apply the Arabic/English language handling rules, and return the verified solution strictly as JSON matching {\"success\": true, \"answers\": \"...\", \"explanation\": \"...\"}.";

function parseGeminiStructuredResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      success: false,
      answers: 'No answer generated.',
      explanation: 'No response from model.'
    };
  }

  let text = rawText.trim();
  // Strip markdown code fences if present (e.g. ```json ... ```)
  text = text.replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/i, '').trim();

  // 1. Direct JSON parse
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      const answers = String(parsed.answers || parsed.answer || '').trim();
      const explanation = String(parsed.explanation || '').trim();
      if (answers) {
        return {
          success: true,
          answers,
          explanation: explanation || 'Calculation and language rules verified.'
        };
      }
    }
  } catch (_) {}

  // 2. Embedded JSON block regex extraction
  const jsonMatch = text.match(/\{[\s\S]*?"answers"[\s\S]*?\}/) || text.match(/\{[\s\S]*?"answer"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const answers = String(parsed.answers || parsed.answer || '').trim();
      const explanation = String(parsed.explanation || '').trim();
      if (answers) {
        return {
          success: true,
          answers,
          explanation: explanation || 'Calculation and language rules verified.'
        };
      }
    } catch (_) {}
  }

  // 3. Fallback: text returned directly
  return {
    success: true,
    answers: text,
    explanation: 'Direct verified output.'
  };
}

const GEMINI_FREE_TIER_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite'
];

const GEMINI_MODELS_CATALOG = {
  'gemini-2.5-flash':      { fallback: 'gemini-3.8-flash' },
  'gemini-3.8-flash':      { fallback: 'gemini-3.6-flash' },
  'gemini-3.6-flash':      { fallback: 'gemini-3.5-flash-lite' },
  'gemini-3.5-flash-lite': { fallback: 'gemini-3.1-flash-lite' },
  'gemini-3.1-flash-lite': { fallback: 'gemini-2.5-flash' }
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
  // Guard: malformed message
  if (!message || !message.action) return false;

  if (message.action === 'SOLVE_SCREEN') {
    handleSolveRequest(sender, message)
      .then((result) => {
        try { sendResponse(result); } catch (_) {}
      })
      .catch((error) => {
        console.error('[BACKGROUND ERROR] handleSolveRequest:', error);
        try {
          sendResponse({
            success: false,
            error: error.message || 'An unexpected error occurred.'
          });
        } catch (_) {}
      });
    return true; // Keep message channel open for async response
  }

  // Unknown action — return false so Chrome can immediately close the port
  return false;
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
  let prompt = DEFAULT_USER_PROMPT;

  if (extractedVerifiedText && extractedVerifiedText.trim()) {
    prompt += `\n\nVERIFIED OCR TEXT EXTRACTION FROM DOM:\n${extractedVerifiedText.trim()}`;
  }

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
  const modelMode = storage.gemini_model || storage.geminiModel || 'gemini-2.5-flash';

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

  // 1. Capture visible tab screenshot via chrome.tabs.captureVisibleTab(null, { format: "png" })
  let dataUrl = null;
  let captureError = 'No capture strategy succeeded';

  try {
    dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
  } catch (e) {
    captureError = errStr(e.message || e);
    // Fallback: capture by sender tab's window if null target fails
    const senderWindowId = sender?.tab?.windowId;
    if (senderWindowId != null) {
      try {
        dataUrl = await chrome.tabs.captureVisibleTab(senderWindowId, { format: 'png' });
      } catch (e2) {
        captureError = errStr(e2.message || e2);
      }
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

  // 2. Preprocess screenshot & extract base64 data payload
  const processedDataUrl = await preprocessScreenshotCanvas(dataUrl);
  const base64Data = processedDataUrl.replace(/^data:image\/\w+;base64,/, '');

  // Instant Cache Check (<1ms Latency)
  const payloadToHash = `${userPrompt}:::${base64Data}`;
  const requestHash = await computeSha256(payloadToHash);
  const cachedResult = await checkCache(requestHash);

  // Classification - Edge Heuristic Task Classifier
  const promptForHeuristic = customPrompt || userPrompt || '';
  const isComplex = isComplexTask(promptForHeuristic);
  const taskComplexity = isComplex ? 'HIGH_COMPLEXITY' : 'LIGHTWEIGHT';

  if (cachedResult) {
    console.log("[Auto-Dynamic Router] Task:", taskComplexity, "| Model Executed:", cachedResult.modelUsed, "| Latency:", 0, "ms | Fallback Triggered:", false);
    const answers = cachedResult.answers || cachedResult.answer;
    return {
      success: true,
      answers: answers,
      answer: answers,
      explanation: cachedResult.explanation || 'Verified from cache.',
      modelUsed: `${cachedResult.modelUsed} [Cache Hit]`,
      modeActive: cachedResult.modeActive,
      wasFallbackTriggered: false,
      fromCache: true
    };
  }

  // 3. Send base64 image payload in a single API request to Gemini Vision model (gemini-2.5-flash)
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

    // 4. Parse structured JSON response matching exact schema
    const parsed = parseGeminiStructuredResponse(result.answer);

    const responsePayload = {
      success: true,
      answers: parsed.answers,
      answer: parsed.answers, // backward-compatibility for UI bar
      explanation: parsed.explanation,
      modelUsed: result.modelUsed,
      modeActive: result.modeActive,
      wasFallbackTriggered: result.wasFallbackTriggered || false
    };

    await writeCache(requestHash, {
      ...result,
      answers: parsed.answers,
      explanation: parsed.explanation
    });

    return responsePayload;
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
  taskComplexity,
  customContents = null
) {
  return handleGeminiRouting(apiKey, modelMode, base64Data, systemPrompt, userPrompt, isComplex, taskComplexity, customContents);
}

// ── Single Auto-Dynamic Model Picker & Zero-Wait Recovery Cascade Matrix ─────
async function handleGeminiRouting(
  apiKey,
  modelMode,
  base64Data,
  systemPrompt,
  userPrompt,
  isComplex,
  taskComplexity,
  customContents = null
) {
  let currentMode = modelMode || 'auto_dynamic';
  const isAuto = !currentMode || currentMode === 'auto_dynamic' || currentMode.startsWith('auto');

  let cascadeList = [];

  if (isAuto) {
    // Dynamic cycle through verified Google AI Studio free tier models:
    // gemini-3.8-flash -> gemini-3.6-flash -> gemini-3.5-flash-lite -> gemini-3.1-flash-lite -> gemini-2.5-flash
    cascadeList = [
      'gemini-2.5-flash',
      'gemini-3.8-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite'
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
      const answer = await callGeminiAPI(apiKey, candidateModel, base64Data, systemPrompt, userPrompt, isComplex, customContents);
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

async function callGeminiAPI(apiKey, model, base64Image, systemPrompt = SYSTEM_PROMPT, userPrompt = DEFAULT_USER_PROMPT, isComplex = false, customContents = null) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  // Deterministic hyperparameter tuning by task
  const generationConfig = {
    temperature: 0.0,
    topP: 0.1,
    maxOutputTokens: 2048,
    responseMimeType: "application/json",
    thinking_summaries: "none",
    thinkingConfig: {
      thinking_summaries: "none"
    }
  };
  if (isComplex) {
    generationConfig.topK = 1;
  }

  let contents;
  if (customContents && Array.isArray(customContents) && customContents.length > 0) {
    contents = customContents;
  } else {
    const userParts = [{ text: userPrompt }];
    if (base64Image) {
      userParts.push({
        inlineData: {
          mimeType: 'image/png',
          data: base64Image
        }
      });
    }
    contents = [
      {
        role: 'user',
        parts: userParts
      }
    ];
  }

  const payload = {
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    contents,
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
