document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const feedbackMsg = document.getElementById('feedbackMessage');
  const testBtn = document.getElementById('testBtn');
  const saveToast = document.getElementById('saveToast');

  const enablePromptInput = document.getElementById('enable-prompt-input');

  const answerColorPicker = document.getElementById('answer-color-picker');
  const answerColorHex = document.getElementById('answer-color-hex');
  const answerFontSize = document.getElementById('answer-font-size');
  const answerFontSizeVal = document.getElementById('answer-font-size-val');

  const buttonColorPicker = document.getElementById('button-color-picker');
  const buttonColorHex = document.getElementById('button-color-hex');
  const buttonSize = document.getElementById('button-size');
  const buttonSizeVal = document.getElementById('button-size-val');

  const promptColorPicker = document.getElementById('prompt-color-picker');
  const promptColorHex = document.getElementById('prompt-color-hex');
  const promptWidth = document.getElementById('prompt-width');
  const promptWidthVal = document.getElementById('prompt-width-val');

  const PROVIDERS = {
    gemini: {
      name: 'Google Gemini',
      keyInputId: 'apiKey-gemini',
      modelSelectId: 'google-models',
      cardId: 'card-gemini',
      btnId: 'btn-provider-gemini',
      dotId: 'dot-gemini',
      badgeId: 'badge-gemini',
      storageKey: 'GEMINI_API_KEY',
      altKey: 'geminiApiKey',
      modelKey: 'gemini_model',
      altModelKey: 'geminiModel',
      defaultModel: 'auto_dynamic_paid',
      getTestConfig: (key, model) => {
        let testModel = (model === 'auto_dynamic_paid' || model === 'auto_paid') ? 'gemini-3.8-flash' : (model === 'auto_dynamic_free' || model === 'auto_free') ? 'gemini-3.5-flash-lite' : (model || 'gemini-3.8-flash');
        return {
          url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(testModel)}:generateContent?key=${encodeURIComponent(key)}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Respond with OK' }] }] })
        };
      }
    },
    openai: {
      name: 'OpenAI',
      keyInputId: 'apiKey-openai',
      modelSelectId: 'openai-models',
      cardId: 'card-openai',
      btnId: 'btn-provider-openai',
      dotId: 'dot-openai',
      badgeId: 'badge-openai',
      storageKey: 'OPENAI_API_KEY',
      modelKey: 'openai_model',
      defaultModel: 'auto_dynamic_paid',
      getTestConfig: (key, model) => {
        let testModel = (model === 'auto_free' || model === 'auto_paid') ? 'gpt-5.4-mini' : model;
        const isReasoning = testModel.startsWith('o1') || testModel.startsWith('o3') || testModel.startsWith('o4');
        const payload = {
          model: testModel,
          messages: [{ role: 'user', content: 'Say OK' }]
        };
        if (isReasoning) {
          payload.max_completion_tokens = 10;
        } else {
          payload.max_tokens = 5;
        }
        return {
          url: 'https://api.openai.com/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
          },
          body: JSON.stringify(payload)
        };
      }
    },
    anthropic: {
      name: 'Anthropic',
      keyInputId: 'apiKey-anthropic',
      modelSelectId: 'anthropic-models',
      cardId: 'card-anthropic',
      btnId: 'btn-provider-anthropic',
      dotId: 'dot-anthropic',
      badgeId: 'badge-anthropic',
      storageKey: 'ANTHROPIC_API_KEY',
      modelKey: 'anthropic_model',
      defaultModel: 'auto_paid',
      getTestConfig: (key, model) => {
        let testModel = (model === 'auto_paid') ? 'claude-haiku-5.5' : model;
        return {
          url: 'https://api.anthropic.com/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: testModel,
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Say OK' }]
          })
        };
      }
    },
    deepseek: {
      name: 'DeepSeek',
      keyInputId: 'apiKey-deepseek',
      modelSelectId: 'deepseek-models',
      cardId: 'card-deepseek',
      btnId: 'btn-provider-deepseek',
      dotId: 'dot-deepseek',
      badgeId: 'badge-deepseek',
      storageKey: 'DEEPSEEK_API_KEY',
      modelKey: 'deepseek_model',
      defaultModel: 'auto_dynamic_paid',
      getTestConfig: (key, model) => {
        let testModel = (model === 'auto_free' || model === 'auto_paid') ? 'deepseek-v4-flash' : model;
        return {
          url: 'https://api.deepseek.com/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
          },
          body: JSON.stringify({
            model: testModel,
            messages: [{ role: 'user', content: 'Say OK' }],
            max_tokens: 10
          })
        };
      }
    },
    openrouter: {
      name: 'OpenRouter',
      keyInputId: 'apiKey-openrouter',
      modelSelectId: 'openrouter-models',
      cardId: 'card-openrouter',
      btnId: 'btn-provider-openrouter',
      dotId: 'dot-openrouter',
      badgeId: 'badge-openrouter',
      storageKey: 'OPENROUTER_API_KEY',
      modelKey: 'openrouter_model',
      defaultModel: 'auto_dynamic_paid',
      getTestConfig: (key, model) => {
        let testModel = (model === 'auto_free' || model === 'auto_paid') ? 'openrouter/free' : model;
        return {
          url: 'https://openrouter.ai/api/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
          },
          body: JSON.stringify({
            model: testModel,
            messages: [{ role: 'user', content: 'Say OK' }],
            max_tokens: 10
          })
        };
      }
    }
  };

  let activeProvider = 'gemini';
  let toastTimer = null;

  function showSaveToast() {
    if (!saveToast) return;
    saveToast.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      saveToast.classList.remove('visible');
    }, 1200);
  }

  function autoSave() {
    const geminiKey = document.getElementById('apiKey-gemini').value.trim();
    const openaiKey = document.getElementById('apiKey-openai').value.trim();
    const anthropicKey = document.getElementById('apiKey-anthropic').value.trim();
    const deepseekKey = document.getElementById('apiKey-deepseek').value.trim();
    const openrouterKey = document.getElementById('apiKey-openrouter').value.trim();

    const geminiModel = document.getElementById('google-models').value;
    const openaiModel = document.getElementById('openai-models').value;
    const anthropicModel = document.getElementById('anthropic-models').value;
    const deepseekModel = document.getElementById('deepseek-models').value;
    const openrouterModel = document.getElementById('openrouter-models').value;

    const isPromptEnabled = enablePromptInput.checked;
    const answerColor = answerColorHex.value.trim() || '#000000';
    const answerSize = parseInt(answerFontSize.value, 10) || 13;
    const buttonColor = buttonColorHex.value.trim() || '#FFFFFF';
    const btnSize = parseInt(buttonSize.value, 10) || 30;
    const promptColor = promptColorHex.value.trim() || '#FFFFFF';
    const pWidth = parseInt(promptWidth.value, 10) || 180;

    const dataToSave = {
      active_provider: activeProvider,
      GEMINI_API_KEY: geminiKey,
      geminiApiKey: geminiKey,
      gemini_model: geminiModel,
      geminiModel: geminiModel,

      OPENAI_API_KEY: openaiKey,
      openai_model: openaiModel,

      ANTHROPIC_API_KEY: anthropicKey,
      anthropic_model: anthropicModel,

      DEEPSEEK_API_KEY: deepseekKey,
      deepseek_model: deepseekModel,

      OPENROUTER_API_KEY: openrouterKey,
      openrouter_model: openrouterModel,

      enable_prompt_input: isPromptEnabled,
      answer_text_color: answerColor,
      answer_font_size: answerSize,
      button_bg_color: buttonColor,
      button_size: btnSize,
      prompt_bg_color: promptColor,
      prompt_width: pWidth
    };

    chrome.storage.local.set(dataToSave, () => {
      updateDots();
      showSaveToast();
    });

    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'UPDATE_SETTINGS',
            settings: dataToSave
          }).catch(() => {});
        }
      });
    } catch (_) {}
  }

  // Load stored settings on popup open
  chrome.storage.local.get([
    'active_provider',
    'GEMINI_API_KEY', 'geminiApiKey', 'gemini_model', 'geminiModel',
    'OPENAI_API_KEY', 'openai_model',
    'ANTHROPIC_API_KEY', 'anthropic_model',
    'DEEPSEEK_API_KEY', 'deepseek_model',
    'OPENROUTER_API_KEY', 'openrouter_model',
    'enable_prompt_input',
    'answer_text_color', 'answer_font_size',
    'button_bg_color', 'button_size',
    'prompt_bg_color', 'prompt_width'
  ], (data) => {
    if (data.active_provider && PROVIDERS[data.active_provider]) {
      activeProvider = data.active_provider;
    }

    const geminiKey = data.GEMINI_API_KEY || data.geminiApiKey || '';
    const geminiInput = document.getElementById('apiKey-gemini');
    if (geminiInput) geminiInput.value = geminiKey;
    const rawGeminiModel = data.gemini_model || data.geminiModel || 'auto_dynamic_paid';
    const geminiModel = (rawGeminiModel === 'auto_free') ? 'auto_dynamic_free' : (rawGeminiModel === 'auto_paid') ? 'auto_dynamic_paid' : rawGeminiModel;
    const geminiSelect = document.getElementById('google-models');
    if (geminiSelect) {
      geminiSelect.value = optionExists(geminiSelect, geminiModel) ? geminiModel : 'auto_dynamic_paid';
    }

    const openaiKey = data.OPENAI_API_KEY || '';
    const openaiInput = document.getElementById('apiKey-openai');
    if (openaiInput) openaiInput.value = openaiKey;
    const openaiSelect = document.getElementById('openai-models');
    if (openaiSelect) {
      openaiSelect.value = optionExists(openaiSelect, data.openai_model) ? data.openai_model : 'auto_free';
    }

    const anthropicKey = data.ANTHROPIC_API_KEY || '';
    const anthropicInput = document.getElementById('apiKey-anthropic');
    if (anthropicInput) anthropicInput.value = anthropicKey;
    const anthropicSelect = document.getElementById('anthropic-models');
    if (anthropicSelect) {
      anthropicSelect.value = (data.anthropic_model && optionExists(anthropicSelect, data.anthropic_model)) ? data.anthropic_model : 'auto_paid';
    }

    const deepseekInput = document.getElementById('apiKey-deepseek');
    if (deepseekInput) deepseekInput.value = data.DEEPSEEK_API_KEY || '';
    const deepseekSelect = document.getElementById('deepseek-models');
    if (deepseekSelect) {
      deepseekSelect.value = (data.deepseek_model && optionExists(deepseekSelect, data.deepseek_model)) ? data.deepseek_model : 'auto_free';
    }

    const openrouterInput = document.getElementById('apiKey-openrouter');
    if (openrouterInput) openrouterInput.value = data.OPENROUTER_API_KEY || '';
    const openrouterSelect = document.getElementById('openrouter-models');
    if (openrouterSelect) {
      openrouterSelect.value = (data.openrouter_model && optionExists(openrouterSelect, data.openrouter_model)) ? data.openrouter_model : 'auto_free';
    }

    const isPromptEnabled = data.enable_prompt_input !== false;
    if (enablePromptInput) enablePromptInput.checked = isPromptEnabled;

    const answerColor = data.answer_text_color || '#000000';
    if (answerColorPicker) answerColorPicker.value = answerColor;
    if (answerColorHex) answerColorHex.value = answerColor.toUpperCase();

    const answerSize = data.answer_font_size || 13;
    if (answerFontSize) answerFontSize.value = answerSize;
    if (answerFontSizeVal) answerFontSizeVal.textContent = `${answerSize}px`;

    const buttonColor = data.button_bg_color || '#FFFFFF';
    if (buttonColorPicker) buttonColorPicker.value = buttonColor;
    if (buttonColorHex) buttonColorHex.value = buttonColor.toUpperCase();

    const btnSize = data.button_size || 30;
    if (buttonSize) buttonSize.value = btnSize;
    if (buttonSizeVal) buttonSizeVal.textContent = `${btnSize}px`;

    const promptColor = data.prompt_bg_color || '#FFFFFF';
    if (promptColorPicker) promptColorPicker.value = promptColor;
    if (promptColorHex) promptColorHex.value = promptColor.toUpperCase();

    const pWidth = data.prompt_width || 180;
    if (promptWidth) promptWidth.value = pWidth;
    if (promptWidthVal) promptWidthVal.textContent = `${pWidth}px`;

    switchActiveProvider(activeProvider);
    updateDots();
  });

  function optionExists(selectElement, val) {
    if (!selectElement) return false;
    return Array.from(selectElement.options).some(opt => opt.value === val);
  }

  document.querySelectorAll('.provider-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const providerId = btn.getAttribute('data-provider');
      if (PROVIDERS[providerId]) {
        activeProvider = providerId;
        switchActiveProvider(activeProvider);
        autoSave();
      }
    });
  });

  function switchActiveProvider(providerId) {
    Object.keys(PROVIDERS).forEach((key) => {
      const cfg = PROVIDERS[key];
      const btn = document.getElementById(cfg.btnId);
      const card = document.getElementById(cfg.cardId);
      const badge = document.getElementById(cfg.badgeId);

      if (key === providerId) {
        btn.classList.add('active');
        card.style.display = 'flex';
        badge.textContent = 'Active';
        badge.className = 'card-badge active';
      } else {
        btn.classList.remove('active');
        card.style.display = 'none';
        badge.textContent = 'Inactive';
        badge.className = 'card-badge';
      }
    });

    updateHeaderStatus();
  }

  function updateDots() {
    Object.keys(PROVIDERS).forEach((key) => {
      const cfg = PROVIDERS[key];
      const val = document.getElementById(cfg.keyInputId).value.trim();
      const dot = document.getElementById(cfg.dotId);
      if (val) {
        dot.classList.add('configured');
      } else {
        dot.classList.remove('configured');
      }
    });
    updateHeaderStatus();
  }

  function updateHeaderStatus() {
    const cfg = PROVIDERS[activeProvider];
    const keyVal = document.getElementById(cfg.keyInputId).value.trim();

    if (keyVal) {
      statusBadge.className = 'status-badge status-configured';
      statusText.textContent = `Active: ${cfg.name}`;
    } else {
      statusBadge.className = 'status-badge status-missing';
      statusText.textContent = `${cfg.name}: No Key`;
    }
  }

  document.querySelectorAll('.toggle-visibility').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.innerHTML = isPassword
        ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
        : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    });
  });

  function setupColorSync(picker, hexInput) {
    if (!picker || !hexInput) return;

    picker.addEventListener('input', () => {
      const val = picker.value.toUpperCase();
      hexInput.value = val;
      autoSave();
    });

    hexInput.addEventListener('input', () => {
      let val = hexInput.value.trim();
      if (!val.startsWith('#') && val.length > 0) val = '#' + val;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        picker.value = val;
        autoSave();
      }
    });

    hexInput.addEventListener('blur', () => {
      let val = hexInput.value.trim();
      if (!val.startsWith('#') && val.length > 0) val = '#' + val;
      if (!/^#[0-9A-Fa-f]{6}$/.test(val)) {
        hexInput.value = picker.value.toUpperCase();
      } else {
        const upper = val.toUpperCase();
        hexInput.value = upper;
        picker.value = upper;
        autoSave();
      }
    });
  }

  function setupSliderSync(slider, valBadge, unit) {
    if (!slider || !valBadge) return;
    slider.addEventListener('input', () => {
      valBadge.textContent = `${slider.value}${unit}`;
      autoSave();
    });
  }

  setupColorSync(answerColorPicker, answerColorHex);
  setupSliderSync(answerFontSize, answerFontSizeVal, 'px');

  setupColorSync(buttonColorPicker, buttonColorHex);
  setupSliderSync(buttonSize, buttonSizeVal, 'px');

  setupColorSync(promptColorPicker, promptColorHex);
  setupSliderSync(promptWidth, promptWidthVal, 'px');

  if (enablePromptInput) {
    enablePromptInput.addEventListener('change', () => {
      autoSave();
    });
  }

  // Attach instant auto-save to all key inputs and selects
  [
    'apiKey-gemini', 'apiKey-openai', 'apiKey-anthropic', 'apiKey-deepseek', 'apiKey-openrouter',
    'google-models', 'openai-models', 'anthropic-models', 'deepseek-models', 'openrouter-models'
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => autoSave());
      el.addEventListener('change', () => autoSave());
      el.addEventListener('blur', () => autoSave());
    }
  });

  // ── Change Position Screen-Picker Handling ──
  const changePosButtons = document.querySelectorAll('.change-pos-btn');

  function clearPickerButtons() {
    changePosButtons.forEach(btn => {
      btn.classList.remove('active-picker');
      btn.textContent = '📍 Change Position';
    });
  }

  changePosButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = btn.getAttribute('data-target');
      const isAlreadyActive = btn.classList.contains('active-picker');

      clearPickerButtons();

      if (!isAlreadyActive) {
        btn.classList.add('active-picker');
        btn.textContent = '🎯 Click on screen...';

        // Dispatch placement mode to active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'ACTIVATE_POSITION_PICKER',
              target: target
            }).catch(() => {});
          }
        });
      }
    });
  });

  // Reset Position Buttons
  document.querySelectorAll('.reset-pos-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = btn.getAttribute('data-target');
      clearPickerButtons();

      chrome.storage.local.remove(`pos_${target}`, () => {
        showSaveToast();
      });

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'RESET_POSITION',
            target: target
          }).catch(() => {});
        }
      });
    });
  });

  // Listen for message from content script when placement completes
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.action === 'POSITION_PICKER_DONE') {
      clearPickerButtons();
      showSaveToast();
    }
  });

  // Test connection button
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      const cfg = PROVIDERS[activeProvider];
      if (!cfg) return;
      const keyInput = document.getElementById(cfg.keyInputId);
      const key = keyInput ? keyInput.value.trim() : '';
      const modelSelect = document.getElementById(cfg.modelSelectId);
      const model = modelSelect ? modelSelect.value : '';

      if (!key) {
        showFeedback(`Please enter an API Key for ${cfg.name} first.`, false);
        return;
      }

      testBtn.disabled = true;
      testBtn.textContent = 'Testing...';
      showFeedback(`Verifying connection to ${cfg.name}...`, true);

      try {
        const req = cfg.getTestConfig(key, model);
        const res = await fetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const errorMsg = json.error?.message || json.message || `HTTP ${res.status}`;
          throw new Error(errorMsg);
        }

        showFeedback(`Connection successful! ${cfg.name} responded properly.`, true);
        updateHeaderStatus();
      } catch (err) {
        showFeedback(`Verification failed: ${err.message}`, false);
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = 'Test Connection';
      }
    });
  }

  function showFeedback(message, isSuccess) {
    feedbackMsg.textContent = message;
    feedbackMsg.className = `feedback-message show ${isSuccess ? 'feedback-success' : 'feedback-error'}`;
    setTimeout(() => {
      feedbackMsg.className = 'feedback-message';
    }, 6000);
  }
});
