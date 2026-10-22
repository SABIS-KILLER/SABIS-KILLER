const SYSTEM_PROMPT =
  "You are an academic solver for visual online quizzes. Analyze the screenshot carefully and output ONLY the ultra-concise final answers following these rules:\n" +
  "- IMPORTANT: You MUST answer EVERY SINGLE question and blank visible on screen. Do not shorten, truncate, or omit any parts. Ensure ALL of Part a, Part b, Part c etc. are fully completed to the last blank.\n" +
  "- FORMAT: Organize by section/part (e.g., Part a, Part b, Part c), separated by pipe characters |.\n" +
  "- FILL-IN-THE-BLANK QUESTIONS: Number each blank in reading order from top to bottom, left to right, using the exact format: 'Blank 1: [Answer], Blank 2: [Answer], Blank 3: [Answer]'.\n" +
  "- MULTIPLE CHOICE / STANDARD QUESTIONS: Use 'Question 1: [Answer]'.\n" +
  "- NO LATEX OR MARKDOWN EXTRA PROSE: Do NOT use LaTeX formulas ($...$), bold syntax (**...**), bullet points (•), or explanation steps. Keep everything strictly plain text for high legibility on a semi-transparent screen overlay.\n" +
  "- Example Output format:\n" +
  "  Part a: Blank 1: 3, Blank 2: 24, Blank 3: 45 | Part b: Blank 1: 3, Blank 2: 4, Blank 3: 5, Blank 4: 0 | Part c: Blank 1: 2, Blank 2: 5, Blank 3: 8";

const PROVIDER_NAMES = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter'
};

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

async function handleSolveRequest(sender, message) {
  const customPrompt = (message && typeof message.customPrompt === 'string') ? message.customPrompt.trim() : '';
  const promptText = customPrompt
    ? `${SYSTEM_PROMPT}\n\nUSER CUSTOM INSTRUCTION: ${customPrompt}`
    : SYSTEM_PROMPT;

  const storage = await chrome.storage.local.get([
    'active_provider',
    'GEMINI_API_KEY', 'geminiApiKey', 'gemini_model', 'geminiModel',
    'OPENAI_API_KEY', 'openai_model',
    'ANTHROPIC_API_KEY', 'anthropic_model',
    'DEEPSEEK_API_KEY', 'deepseek_model',
    'OPENROUTER_API_KEY', 'openrouter_model'
  ]);

  const activeProvider = storage.active_provider || 'gemini';
  const providerName = PROVIDER_NAMES[activeProvider] || 'AI Provider';

  let apiKey = '';
  let modelMode = '';

  if (activeProvider === 'gemini') {
    apiKey = storage.GEMINI_API_KEY || storage.geminiApiKey || '';
    modelMode = storage.gemini_model || storage.geminiModel || 'auto_free';
  } else if (activeProvider === 'openai') {
    apiKey = storage.OPENAI_API_KEY || '';
    modelMode = storage.openai_model || 'auto_free';
  } else if (activeProvider === 'anthropic') {
    apiKey = storage.ANTHROPIC_API_KEY || '';
    modelMode = storage.anthropic_model || 'auto_paid';
  } else if (activeProvider === 'deepseek') {
    apiKey = storage.DEEPSEEK_API_KEY || '';
    modelMode = storage.deepseek_model || 'auto_free';
  } else if (activeProvider === 'openrouter') {
    apiKey = storage.OPENROUTER_API_KEY || '';
    modelMode = storage.openrouter_model || 'auto_free';
  }

  if (!apiKey || !apiKey.trim()) {
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

  try {
    const result = await routeProviderRequest(activeProvider, apiKey.trim(), modelMode, base64Data, promptText);
    return {
      success: true,
      answer: result.answer,
      modelUsed: result.modelUsed
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
  if (err.status === 429 || err.status === 402 || err.status === 503) return true;
  const msg = (err.message || String(err)).toLowerCase();
  return (
    msg.includes('429') ||
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

async function routeProviderRequest(provider, apiKey, modelMode, base64Data, promptText) {
  switch (provider) {
    case 'gemini':
      return handleGeminiRouting(apiKey, modelMode, base64Data, promptText);
    case 'openai':
      return handleOpenAIRouting(apiKey, modelMode, base64Data, promptText);
    case 'anthropic':
      return handleAnthropicRouting(apiKey, modelMode, base64Data, promptText);
    case 'deepseek':
      return handleDeepSeekRouting(apiKey, modelMode, base64Data, promptText);
    case 'openrouter':
      return handleOpenRouterRouting(apiKey, modelMode, base64Data, promptText);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

async function handleGeminiRouting(apiKey, modelMode, base64Data, promptText) {
  if (modelMode === 'auto_free' || modelMode === 'auto') {
    const freeModels = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-2.5-flash'];
    return tryModelsInOrder(freeModels, (m) => callGeminiAPI(apiKey, m, base64Data, promptText));
  } else if (modelMode === 'auto_paid') {
    try {
      const ans = await callGeminiAPI(apiKey, 'gemini-4-argon', base64Data, promptText);
      return { answer: ans, modelUsed: 'gemini-4-argon' };
    } catch (err) {
      if (isQuotaOrRateLimitError(err) || err.status === 404) {
        console.warn('gemini-4-argon failover to gemini-3.8-flash');
        const ans = await callGeminiAPI(apiKey, 'gemini-3.8-flash', base64Data, promptText);
        return { answer: ans, modelUsed: 'gemini-3.8-flash (failover)' };
      }
      throw err;
    }
  } else {
    const safeModel = (!modelMode || modelMode.startsWith('auto')) ? 'gemini-2.5-flash' : modelMode;
    const ans = await callGeminiAPI(apiKey, safeModel, base64Data, promptText);
    return { answer: ans, modelUsed: safeModel };
  }
}

async function handleOpenAIRouting(apiKey, modelMode, base64Data, promptText) {
  if (modelMode === 'auto_free') {
    try {
      const ans = await callOpenAIAPI(apiKey, 'gpt-5.4-mini', base64Data, promptText);
      return { answer: ans, modelUsed: 'gpt-5.4-mini' };
    } catch (err) {
      console.warn('gpt-5.4-mini failover to gpt-4o-mini');
      const ans = await callOpenAIAPI(apiKey, 'gpt-4o-mini', base64Data, promptText);
      return { answer: ans, modelUsed: 'gpt-4o-mini (failover)' };
    }
  } else if (modelMode === 'auto_paid') {
    try {
      const ans = await callOpenAIAPI(apiKey, 'gpt-5.5', base64Data, promptText);
      return { answer: ans, modelUsed: 'gpt-5.5' };
    } catch (err) {
      if (isQuotaOrRateLimitError(err) || err.status === 404) {
        console.warn('gpt-5.5 failover to gpt-5.4-mini');
        const ans = await callOpenAIAPI(apiKey, 'gpt-5.4-mini', base64Data, promptText);
        return { answer: ans, modelUsed: 'gpt-5.4-mini (failover)' };
      }
      throw err;
    }
  } else {
    const ans = await callOpenAIAPI(apiKey, modelMode, base64Data, promptText);
    return { answer: ans, modelUsed: modelMode };
  }
}

async function handleAnthropicRouting(apiKey, modelMode, base64Data, promptText) {
  if (modelMode === 'auto_paid') {
    try {
      const ans = await callAnthropicAPI(apiKey, 'claude-fable-5.1', base64Data, promptText);
      return { answer: ans, modelUsed: 'claude-fable-5.1' };
    } catch (err) {
      if (isQuotaOrRateLimitError(err) || err.status === 404) {
        console.warn('claude-fable-5.1 failover to claude-sonnet-5.5');
        const ans = await callAnthropicAPI(apiKey, 'claude-sonnet-5.5', base64Data, promptText);
        return { answer: ans, modelUsed: 'claude-sonnet-5.5 (failover)' };
      }
      throw err;
    }
  } else {
    const ans = await callAnthropicAPI(apiKey, modelMode, base64Data, promptText);
    return { answer: ans, modelUsed: modelMode };
  }
}

async function handleDeepSeekRouting(apiKey, modelMode, base64Data, promptText) {
  if (modelMode === 'auto_free') {
    const ans = await callDeepSeekAPI(apiKey, 'deepseek-v4-flash', base64Data, promptText);
    return { answer: ans, modelUsed: 'deepseek-v4-flash' };
  } else if (modelMode === 'auto_paid') {
    try {
      const ans = await callDeepSeekAPI(apiKey, 'deepseek-v4-pro', base64Data, promptText);
      return { answer: ans, modelUsed: 'deepseek-v4-pro' };
    } catch (err) {
      if (isQuotaOrRateLimitError(err) || err.status === 404) {
        console.warn('deepseek-v4-pro failover to deepseek-v4-flash');
        const ans = await callDeepSeekAPI(apiKey, 'deepseek-v4-flash', base64Data, promptText);
        return { answer: ans, modelUsed: 'deepseek-v4-flash (failover)' };
      }
      throw err;
    }
  } else {
    const ans = await callDeepSeekAPI(apiKey, modelMode, base64Data, promptText);
    return { answer: ans, modelUsed: modelMode };
  }
}

async function handleOpenRouterRouting(apiKey, modelMode, base64Data, promptText) {
  const freeVariants = [
    'openrouter/free',
    'deepseek/deepseek-r1:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'qwen/qwq-32b:free',
    'google/gemini-2.5-flash:free'
  ];

  if (modelMode === 'auto_free') {
    return tryModelsInOrder(freeVariants, (m) => callOpenRouterAPI(apiKey, m, base64Data, promptText));
  } else if (modelMode === 'auto_paid') {
    try {
      const ans = await callOpenRouterAPI(apiKey, 'openrouter/auto', base64Data, promptText);
      return { answer: ans, modelUsed: 'openrouter/auto' };
    } catch (err) {
      if (isQuotaOrRateLimitError(err) || err.status === 404) {
        console.warn('openrouter/auto failover to openrouter/free variants');
        return tryModelsInOrder(freeVariants, (m) => callOpenRouterAPI(apiKey, m, base64Data, promptText));
      }
      throw err;
    }
  } else {
    const ans = await callOpenRouterAPI(apiKey, modelMode, base64Data, promptText);
    return { answer: ans, modelUsed: modelMode };
  }
}

async function tryModelsInOrder(modelList, callFn) {
  let lastErr = null;
  for (const model of modelList) {
    try {
      const answer = await callFn(model);
      return { answer, modelUsed: model };
    } catch (err) {
      lastErr = err;
      console.warn(`Model ${model} failed (${err.message}). Trying next candidate...`);
    }
  }
  throw lastErr || new Error('All models in fallback list failed.');
}

async function callGeminiAPI(apiKey, model, base64Image, promptText = SYSTEM_PROMPT) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const payload = {
    systemInstruction: {
      parts: [{ text: promptText }]
    },
    contents: [
      {
        role: 'user',
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Image
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

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
    return 'No questions detected or answer could not be generated.';
  }

  const textPart = candidate.content?.parts?.find((p) => p.text)?.text;
  if (!textPart || !textPart.trim()) {
    return 'No academic questions detected in this screenshot.';
  }

  return textPart.trim();
}

async function callOpenAIAPI(apiKey, model, base64Image, promptText = SYSTEM_PROMPT) {
  const isReasoning = model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4');

  const messages = isReasoning
    ? [
        {
          role: 'user',
          content: [
            { type: 'text', text: `${promptText}\n\nSolve all academic/quiz questions visible in this screenshot.` },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
          ]
        }
      ]
    : [
        { role: 'system', content: promptText },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Solve all academic/quiz questions visible in this screenshot according to instructions.' },
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
    payload.temperature = 0.1;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

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

async function callAnthropicAPI(apiKey, model, base64Image, promptText = SYSTEM_PROMPT) {
  let resolvedModel = model;
  if (model === 'claude-3-5-sonnet') resolvedModel = 'claude-3-5-sonnet-20241022';
  else if (model === 'claude-3-5-haiku') resolvedModel = 'claude-3-5-haiku-20241022';
  else if (model === 'claude-3-opus') resolvedModel = 'claude-3-opus-20240229';

  const payload = {
    model: resolvedModel,
    system: promptText,
    max_tokens: 2048,
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
            text: 'Solve all academic/quiz questions visible in this screenshot according to instructions.'
          }
        ]
      }
    ]
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(payload)
  });

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

async function callDeepSeekAPI(apiKey, model, base64Image, promptText = SYSTEM_PROMPT) {
  const payload = {
    model: model,
    messages: [
      { role: 'system', content: promptText },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Solve all academic/quiz questions visible in this screenshot according to instructions.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
        ]
      }
    ],
    max_tokens: 2048,
    temperature: 0.1
  };

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

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

async function callOpenRouterAPI(apiKey, model, base64Image, promptText = SYSTEM_PROMPT) {
  const payload = {
    model: model,
    messages: [
      { role: 'system', content: promptText },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Solve all academic/quiz questions visible in this screenshot according to instructions.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
        ]
      }
    ],
    max_tokens: 2048,
    temperature: 0.1
  };

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

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
