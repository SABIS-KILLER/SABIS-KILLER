(() => {
  if (window.__ACADEMIC_SOLVER_INITIALIZED__) return;
  window.__ACADEMIC_SOLVER_INITIALIZED__ = true;

  let isUIVisible = true;
  let isSolving = false;
  let currentAnswerText = '';

  let appearance = {
    enable_prompt_input: true,
    answer_text_color: '#FFFFFF',
    answer_font_size: 14,
    button_bg_color: '#FFFFFF',
    button_size: 30,
    prompt_bg_color: '#FFFFFF',
    prompt_width: 180,
    settings_btn_bg_color: '#FFFFFF',
    settings_btn_size: 32,
    glass_refraction: 70     // 0 = fully solid/opaque, 100 = maximum liquid glass
  };

  // Stored positions for each repositionable element
  let positions = {
    button: null,    // { x, y } in px from viewport top-left
    prompt: null,
    answer: null,
    settings: null
  };

  let activePickerTarget = null;
  let pickerOverlay = null;

  let host = document.getElementById('academic-solver-root');
  let shadow = null;
  let bottomControlsBar = null;
  let promptInput = null;
  let captureButton = null;
  let settingsButton = null;
  let answerContainer = null;
  let answerText = null;
  let modelBadge = null;
  let uiWrapper = null;
  let hiddenToggleZone = null;

  // In-Page Settings Modal Elements
  let settingsModalBackdrop = null;
  let settingsModalDialog = null;
  let modalSaveToast = null;
  let saveToastTimer = null;
  let currentActiveProvider = 'gemini';

  const PROVIDERS = {
    gemini: {
      name: 'Google Gemini',
      keyInputId: 'modal-apiKey-gemini',
      modelSelectId: 'modal-google-models',
      cardId: 'modal-card-gemini',
      btnId: 'modal-btn-provider-gemini',
      dotId: 'modal-dot-gemini',
      badgeId: 'modal-badge-gemini',
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
      keyInputId: 'modal-apiKey-openai',
      modelSelectId: 'modal-openai-models',
      cardId: 'modal-card-openai',
      btnId: 'modal-btn-provider-openai',
      dotId: 'modal-dot-openai',
      badgeId: 'modal-badge-openai',
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
      keyInputId: 'modal-apiKey-anthropic',
      modelSelectId: 'modal-anthropic-models',
      cardId: 'modal-card-anthropic',
      btnId: 'modal-btn-provider-anthropic',
      dotId: 'modal-dot-anthropic',
      badgeId: 'modal-badge-anthropic',
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
            'anthropic-version': '2023-06-01'
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
      keyInputId: 'modal-apiKey-deepseek',
      modelSelectId: 'modal-deepseek-models',
      cardId: 'modal-card-deepseek',
      btnId: 'modal-btn-provider-deepseek',
      dotId: 'modal-dot-deepseek',
      badgeId: 'modal-badge-deepseek',
      storageKey: 'DEEPSEEK_API_KEY',
      modelKey: 'deepseek_model',
      defaultModel: 'auto_free',
      getTestConfig: (key, model) => {
        let testModel = (model === 'auto_free' || model === 'auto_paid') ? 'deepseek-chat' : model;
        return {
          url: 'https://api.deepseek.com/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
          },
          body: JSON.stringify({
            model: testModel,
            messages: [{ role: 'user', content: 'Say OK' }],
            max_tokens: 5
          })
        };
      }
    },
    openrouter: {
      name: 'OpenRouter',
      keyInputId: 'modal-apiKey-openrouter',
      modelSelectId: 'modal-openrouter-models',
      cardId: 'modal-card-openrouter',
      btnId: 'modal-btn-provider-openrouter',
      dotId: 'modal-dot-openrouter',
      badgeId: 'modal-badge-openrouter',
      storageKey: 'OPENROUTER_API_KEY',
      modelKey: 'openrouter_model',
      defaultModel: 'auto_free',
      getTestConfig: (key, model) => {
        let testModel = (model === 'auto_free') ? 'openrouter/free' : (model === 'auto_paid') ? 'openrouter/auto' : model;
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
            max_tokens: 5
          })
        };
      }
    }
  };

  const isRuntimeValid = () => {
    try {
      return typeof chrome !== 'undefined' &&
             !!chrome.runtime &&
             typeof chrome.runtime.sendMessage === 'function' &&
             !!chrome.runtime.id;
    } catch (_) {
      return false;
    }
  };

  function getContrastColor(hexColor) {
    if (!hexColor || typeof hexColor !== 'string') return '#FFFFFF';
    let hex = hexColor.replace('#', '').trim();
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    if (hex.length !== 6) return '#FFFFFF';
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 140 ? '#000000' : '#FFFFFF';
  }

  function hexToRgba(hexColor, alpha = 0.65) {
    if (!hexColor || typeof hexColor !== 'string') return `rgba(255, 255, 255, ${alpha})`;
    let hex = hexColor.replace('#', '').trim();
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    if (hex.length !== 6) return `rgba(255, 255, 255, ${alpha})`;
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // ── Dynamic Liquid Glass Refraction System ───────────────────────────────
  // Maps slider value (0-100) → CSS custom properties set on the shadow host.
  // CSS inside shadow DOM reads these via var(--glass-*) to apply glass effects.
  // 0% = fully solid/opaque  |  100% = maximum translucent liquid glass
  function applyGlassRefraction(value) {
    if (!host) return;
    const t = Math.max(0, Math.min(100, parseInt(value, 10) || 70)) / 100;
    // Background opacity: 1.0 (solid) → 0.25 (ultra-translucent)
    host.style.setProperty('--glass-bg-opacity',   (0.25 + 0.75 * (1 - t)).toFixed(3));
    // Backdrop blur: 0px → 40px
    host.style.setProperty('--glass-blur',         `${Math.round(t * 40)}px`);
    // Saturate: 100% → 220%
    host.style.setProperty('--glass-saturate',     `${Math.round(100 + t * 120)}%`);
    // Refraction scalar (0→1) used in calc() for edge highlights & shadows
    host.style.setProperty('--glass-refraction',   t.toFixed(3));
    // Border transparency: 0.15 → 0.65
    host.style.setProperty('--glass-border-alpha', (0.15 + 0.50 * t).toFixed(3));
    // Inset top-highlight: 0 → 0.80
    host.style.setProperty('--glass-inset-alpha',  (0.80 * t).toFixed(3));
    // Outer shadow: 0.04 → 0.25
    host.style.setProperty('--glass-shadow-alpha', (0.04 + 0.21 * t).toFixed(3));
    // Card opacity (slightly more opaque than main): 1.0 → 0.40
    host.style.setProperty('--glass-card-opacity', (0.40 + 0.60 * (1 - t)).toFixed(3));
  }

  function applyAppearanceSettings(newSettings) {
    if (!newSettings) return;
    appearance = { ...appearance, ...newSettings };

    // Update CSS custom properties for the glass refraction system
    applyGlassRefraction(appearance.glass_refraction || 70);

    // Compute glass parameters for inline-styled elements (buttons / prompt)
    const _gt = Math.max(0, Math.min(100, parseInt(appearance.glass_refraction || 70, 10))) / 100;
    const _gBgOp    = parseFloat((0.25 + 0.75 * (1 - _gt)).toFixed(3));
    const _gBlur    = Math.round(_gt * 40);
    const _gSat     = Math.round(100 + _gt * 120);
    const _gBorder  = parseFloat((0.15 + 0.50 * _gt).toFixed(3));
    const _gInset   = parseFloat((0.80 * _gt).toFixed(3));
    const _gShadow  = parseFloat((0.04 + 0.21 * _gt).toFixed(3));
    const _gRef     = _gt;

    if (answerContainer) {
      answerContainer.style.setProperty('background', 'transparent', 'important');
      answerContainer.style.setProperty('backdrop-filter', 'none', 'important');
      answerContainer.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
      answerContainer.style.setProperty('border', 'none', 'important');
      answerContainer.style.setProperty('box-shadow', 'none', 'important');
      answerContainer.style.setProperty('padding', '0', 'important');
    }

    if (answerText) {
      const textColor = appearance.answer_text_color || '#FFFFFF';
      const fontSize = appearance.answer_font_size || 14;
      answerText.style.setProperty('color', textColor, 'important');
      answerText.style.setProperty('font-size', `${fontSize}px`, 'important');
      answerText.style.setProperty('font-weight', '600', 'important');
      answerText.style.setProperty('background', 'transparent', 'important');
      answerText.style.setProperty('opacity', '1', 'important');
      answerText.style.setProperty('backdrop-filter', 'none', 'important');
      answerText.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
      answerText.style.setProperty('border', 'none', 'important');
      answerText.style.setProperty('box-shadow', 'none', 'important');
      answerText.style.setProperty('text-shadow', '0px 1px 4px rgba(0, 0, 0, 0.9), 0px 0px 8px rgba(0, 0, 0, 0.8)', 'important');
    }

    if (captureButton) {
      const btnColor = appearance.button_bg_color || '#FFFFFF';
      const btnSize = parseInt(appearance.button_size, 10) || 30;
      const contrast = getContrastColor(btnColor);
      const translucentBg = hexToRgba(btnColor, _gBgOp);

      captureButton.style.setProperty('background', translucentBg, 'important');
      captureButton.style.setProperty('backdrop-filter', `blur(${_gBlur}px) saturate(${_gSat}%)`, 'important');
      captureButton.style.setProperty('-webkit-backdrop-filter', `blur(${_gBlur}px) saturate(${_gSat}%)`, 'important');
      captureButton.style.setProperty('border', `1px solid rgba(255, 255, 255, ${_gBorder})`, 'important');
      captureButton.style.setProperty('box-shadow', `inset 0 1px 0 rgba(255, 255, 255, ${_gInset}), inset 0 -1px 0 rgba(0, 0, 0, ${(_gRef * 0.30).toFixed(3)}), 0 8px 24px rgba(0, 0, 0, ${_gShadow}), 0 2px 6px rgba(0, 0, 0, ${(_gShadow * 0.32).toFixed(3)})`, 'important');
      captureButton.style.setProperty('width', `${btnSize}px`, 'important');
      captureButton.style.setProperty('height', `${btnSize}px`, 'important');

      const svg = captureButton.querySelector('svg');
      if (svg) {
        const iconSize = Math.max(5, Math.round(btnSize * 0.46));
        svg.setAttribute('width', iconSize);
        svg.setAttribute('height', iconSize);
        svg.style.setProperty('stroke', contrast, 'important');
      }
    }

    if (settingsButton) {
      const sColor = appearance.settings_btn_bg_color || '#FFFFFF';
      const sSize = parseInt(appearance.settings_btn_size, 10) || 32;
      const sContrast = getContrastColor(sColor);
      const translucentBg = hexToRgba(sColor, _gBgOp);

      settingsButton.style.setProperty('background', translucentBg, 'important');
      settingsButton.style.setProperty('backdrop-filter', `blur(${_gBlur}px) saturate(${_gSat}%)`, 'important');
      settingsButton.style.setProperty('-webkit-backdrop-filter', `blur(${_gBlur}px) saturate(${_gSat}%)`, 'important');
      settingsButton.style.setProperty('border', `1px solid rgba(255, 255, 255, ${_gBorder})`, 'important');
      settingsButton.style.setProperty('box-shadow', `inset 0 1px 0 rgba(255, 255, 255, ${_gInset}), inset 0 -1px 0 rgba(0, 0, 0, ${(_gRef * 0.30).toFixed(3)}), 0 8px 24px rgba(0, 0, 0, ${_gShadow})`, 'important');
      settingsButton.style.setProperty('width', `${sSize}px`, 'important');
      settingsButton.style.setProperty('height', `${sSize}px`, 'important');

      const svg = settingsButton.querySelector('svg');
      if (svg) {
        const iconSize = Math.max(10, Math.round(sSize * 0.52));
        svg.setAttribute('width', iconSize);
        svg.setAttribute('height', iconSize);
        svg.style.setProperty('stroke', sContrast, 'important');
      }
    }

    if (promptInput) {
      const isEnabled = appearance.enable_prompt_input !== false;
      promptInput.style.display = isEnabled ? 'block' : 'none';

      const pColor = appearance.prompt_bg_color || '#FFFFFF';
      const pWidth = parseInt(appearance.prompt_width, 10) || 180;
      const pContrast = getContrastColor(pColor);
      const translucentPromptBg = hexToRgba(pColor, _gBgOp);

      promptInput.style.setProperty('background', translucentPromptBg, 'important');
      promptInput.style.setProperty('backdrop-filter', `blur(${_gBlur}px) saturate(${_gSat}%)`, 'important');
      promptInput.style.setProperty('-webkit-backdrop-filter', `blur(${_gBlur}px) saturate(${_gSat}%)`, 'important');
      promptInput.style.setProperty('border', `1px solid rgba(255, 255, 255, ${(_gBorder * 0.75).toFixed(3)})`, 'important');
      promptInput.style.setProperty('box-shadow', `inset 0 1px 0 rgba(255, 255, 255, ${_gInset}), 0 8px 24px rgba(0, 0, 0, ${_gShadow})`, 'important');
      promptInput.style.setProperty('color', pContrast, 'important');
      promptInput.style.setProperty('width', `${pWidth}px`, 'important');
    }
  }

  function applyTargetPosition(target, x, y) {
    if (x == null || y == null) return;
    if (target === 'button' && captureButton) {
      captureButton.style.setProperty('position', 'fixed', 'important');
      captureButton.style.setProperty('top', `${y}px`, 'important');
      captureButton.style.setProperty('left', `${x}px`, 'important');
      captureButton.style.setProperty('bottom', 'auto', 'important');
      captureButton.style.setProperty('right', 'auto', 'important');
      captureButton.style.setProperty('z-index', '2147483647', 'important');
    } else if (target === 'prompt' && promptInput) {
      promptInput.style.setProperty('position', 'fixed', 'important');
      promptInput.style.setProperty('top', `${y}px`, 'important');
      promptInput.style.setProperty('left', `${x}px`, 'important');
      promptInput.style.setProperty('bottom', 'auto', 'important');
      promptInput.style.setProperty('right', 'auto', 'important');
      promptInput.style.setProperty('z-index', '2147483647', 'important');
    } else if (target === 'settings' && settingsButton) {
      settingsButton.style.setProperty('position', 'fixed', 'important');
      settingsButton.style.setProperty('top', `${y}px`, 'important');
      settingsButton.style.setProperty('left', `${x}px`, 'important');
      settingsButton.style.setProperty('bottom', 'auto', 'important');
      settingsButton.style.setProperty('right', 'auto', 'important');
      settingsButton.style.setProperty('z-index', '2147483647', 'important');
    } else if (target === 'answer' && answerContainer) {
      answerContainer.style.setProperty('position', 'fixed', 'important');
      answerContainer.style.setProperty('top', `${y}px`, 'important');
      answerContainer.style.setProperty('left', `${x}px`, 'important');
      answerContainer.style.setProperty('bottom', 'auto', 'important');
      answerContainer.style.setProperty('right', 'auto', 'important');
      answerContainer.style.setProperty('width', 'auto', 'important');
      answerContainer.style.setProperty('max-width', '90vw', 'important');
      answerContainer.style.setProperty('background', 'transparent', 'important');
      answerContainer.style.setProperty('backdrop-filter', 'none', 'important');
      answerContainer.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
      answerContainer.style.setProperty('border', 'none', 'important');
      answerContainer.style.setProperty('box-shadow', 'none', 'important');
      answerContainer.style.setProperty('z-index', '2147483646', 'important');
    }
  }

  function resetTargetPosition(target) {
    if (target === 'button' && captureButton) {
      captureButton.style.removeProperty('position');
      captureButton.style.removeProperty('top');
      captureButton.style.removeProperty('left');
      captureButton.style.removeProperty('bottom');
      captureButton.style.removeProperty('right');
      captureButton.style.removeProperty('z-index');
    } else if (target === 'prompt' && promptInput) {
      promptInput.style.removeProperty('position');
      promptInput.style.removeProperty('top');
      promptInput.style.removeProperty('left');
      promptInput.style.removeProperty('bottom');
      promptInput.style.removeProperty('right');
      promptInput.style.removeProperty('z-index');
    } else if (target === 'settings' && settingsButton) {
      settingsButton.style.removeProperty('position');
      settingsButton.style.removeProperty('top');
      settingsButton.style.removeProperty('left');
      settingsButton.style.removeProperty('bottom');
      settingsButton.style.removeProperty('right');
      settingsButton.style.removeProperty('z-index');
      settingsButton.style.setProperty('position', 'fixed', 'important');
      settingsButton.style.setProperty('top', '16px', 'important');
      settingsButton.style.setProperty('right', '16px', 'important');
      settingsButton.style.setProperty('left', 'auto', 'important');
      settingsButton.style.setProperty('bottom', 'auto', 'important');
    } else if (target === 'answer' && answerContainer) {
      answerContainer.style.removeProperty('top');
      answerContainer.style.removeProperty('right');
      answerContainer.style.removeProperty('max-width');
      answerContainer.style.setProperty('position', 'fixed', 'important');
      answerContainer.style.setProperty('bottom', '8px', 'important');
      answerContainer.style.setProperty('left', '8px', 'important');
      answerContainer.style.setProperty('width', 'auto', 'important');
      answerContainer.style.setProperty('background', 'transparent', 'important');
      answerContainer.style.setProperty('backdrop-filter', 'none', 'important');
      answerContainer.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
      answerContainer.style.setProperty('border', 'none', 'important');
      answerContainer.style.setProperty('box-shadow', 'none', 'important');
      answerContainer.style.setProperty('z-index', '2147483646', 'important');
    }
  }

  function applyPositions() {
    if (positions.button) {
      applyTargetPosition('button', positions.button.x, positions.button.y);
    } else {
      resetTargetPosition('button');
    }

    if (positions.prompt) {
      applyTargetPosition('prompt', positions.prompt.x, positions.prompt.y);
    } else {
      resetTargetPosition('prompt');
    }

    if (positions.settings) {
      applyTargetPosition('settings', positions.settings.x, positions.settings.y);
    } else {
      resetTargetPosition('settings');
    }

    if (positions.answer) {
      applyTargetPosition('answer', positions.answer.x, positions.answer.y);
    } else {
      resetTargetPosition('answer');
    }
  }

  function loadStoredSettings() {
    if (!isRuntimeValid() || !chrome.storage || !chrome.storage.local) return;
    try {
      chrome.storage.local.get([
        'enable_prompt_input',
        'answer_text_color', 'answer_font_size',
        'button_bg_color', 'button_size',
        'prompt_bg_color', 'prompt_width',
        'settings_btn_bg_color', 'settings_btn_size',
        'glass_refraction',
        'button_position', 'pos_button',
        'prompt_position', 'pos_prompt',
        'answer_position', 'pos_answer',
        'settings_position', 'pos_settings'
      ], (data) => {
        if (chrome.runtime.lastError) return;
        applyAppearanceSettings(data);
        const btnPos = data.button_position || data.pos_button;
        const pPos = data.prompt_position || data.pos_prompt;
        const ansPos = data.answer_position || data.pos_answer;
        const sPos = data.settings_position || data.pos_settings;
        if (btnPos && btnPos.x != null && btnPos.y != null) positions.button = btnPos;
        if (pPos && pPos.x != null && pPos.y != null) positions.prompt = pPos;
        if (ansPos && ansPos.x != null && ansPos.y != null) positions.answer = ansPos;
        if (sPos && sPos.x != null && sPos.y != null) positions.settings = sPos;
        applyPositions();
      });
    } catch (_) {}
  }

  // ── Position Picker ─────────────────────────────────────────────────────────

  function startPositionPicker(targetElement, onComplete) {
    activePickerTarget = targetElement;
    let wasModalOpen = false;
    if (settingsModalDialog && settingsModalDialog.classList.contains('open')) {
      wasModalOpen = true;
      closeSettingsModal(true); // temporarily close without changing state
    }

    const existing = document.getElementById('position-picker-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'position-picker-overlay';
    overlay.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'width: 100vw',
      'height: 100vh',
      'z-index: 2147483647',
      'cursor: crosshair',
      'background: rgba(0, 0, 0, 0.12)',
      'backdrop-filter: blur(4px) saturate(140%)',
      '-webkit-backdrop-filter: blur(4px) saturate(140%)',
      'pointer-events: auto'
    ].join(' !important;') + ' !important;';

    const targetDoc = document.body || document.documentElement;
    if (targetDoc) targetDoc.appendChild(overlay);

    function handleScreenClick(e) {
      e.preventDefault();
      e.stopPropagation();

      const posX = e.clientX;
      const posY = e.clientY;

      const overlayEl = document.getElementById('position-picker-overlay');
      if (overlayEl) overlayEl.remove();

      positions[targetElement] = { x: posX, y: posY };
      applyTargetPosition(targetElement, posX, posY);

      try {
        chrome.storage.local.set({
          [targetElement + '_position']: { x: posX, y: posY },
          ['pos_' + targetElement]: { x: posX, y: posY }
        }, () => {
          if (wasModalOpen) {
            openSettingsModal();
            showModalToast('Position Saved');
          }
          if (typeof onComplete === 'function') onComplete({ x: posX, y: posY });
        });
      } catch (_) {
        if (wasModalOpen) openSettingsModal();
      }

      window.removeEventListener('keydown', handleKeydown, { capture: true });
    }

    function handleKeydown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        const overlayEl = document.getElementById('position-picker-overlay');
        if (overlayEl) overlayEl.remove();
        window.removeEventListener('click', handleScreenClick, { capture: true });
        window.removeEventListener('keydown', handleKeydown, { capture: true });
        if (wasModalOpen) openSettingsModal();
      }
    }

    window.addEventListener('click', handleScreenClick, { capture: true, once: true });
    window.addEventListener('keydown', handleKeydown, { capture: true, once: true });
  }

  // ── In-Page Settings Modal Controller ──────────────────────────────────────

  function showModalToast(msg = 'Saved') {
    if (!modalSaveToast) return;
    const span = modalSaveToast.querySelector('span');
    if (span) span.textContent = msg;
    modalSaveToast.classList.add('visible');
    if (saveToastTimer) clearTimeout(saveToastTimer);
    saveToastTimer = setTimeout(() => {
      modalSaveToast.classList.remove('visible');
    }, 1500);
  }

  function openSettingsModal() {
    if (!settingsModalBackdrop || !settingsModalDialog) return;
    populateModalFields();
    settingsModalBackdrop.classList.add('open');
    settingsModalDialog.classList.add('open');
  }

  function closeSettingsModal(isTemporary = false) {
    if (!settingsModalBackdrop || !settingsModalDialog) return;
    settingsModalBackdrop.classList.remove('open');
    settingsModalDialog.classList.remove('open');
  }

  function toggleSettingsModal() {
    if (!settingsModalDialog) return;
    if (settingsModalDialog.classList.contains('open')) {
      closeSettingsModal();
    } else {
      openSettingsModal();
    }
  }

  function updateModalProviderStatus() {
    if (!shadow) return;
    const badge = shadow.getElementById('settings-modal-status-badge');
    const text = shadow.getElementById('settings-modal-status-text');
    const cfg = PROVIDERS[currentActiveProvider];
    if (!cfg || !badge || !text) return;

    const input = shadow.getElementById(cfg.keyInputId);
    const keyVal = input ? input.value.trim() : '';

    if (keyVal) {
      badge.className = 'status-configured';
      text.textContent = `Active: ${cfg.name}`;
    } else {
      badge.className = 'status-missing';
      text.textContent = `${cfg.name}: No Key`;
    }
  }

  function switchModalProvider(provider) {
    if (!PROVIDERS[provider] || !shadow) return;
    currentActiveProvider = provider;

    shadow.querySelectorAll('.modal-provider-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-provider') === provider);
    });

    shadow.querySelectorAll('.modal-provider-card').forEach(card => {
      card.style.display = 'none';
    });

    const activeCard = shadow.getElementById(PROVIDERS[provider].cardId);
    if (activeCard) activeCard.style.display = 'flex';

    updateModalProviderStatus();
    autoSaveModal();
  }

  function populateModalFields() {
    if (!isRuntimeValid() || !chrome.storage || !chrome.storage.local || !shadow) return;
    chrome.storage.local.get([
      'ACTIVE_PROVIDER', 'activeProvider',
      'GEMINI_API_KEY', 'geminiApiKey', 'gemini_model', 'geminiModel',
      'OPENAI_API_KEY', 'openai_model',
      'ANTHROPIC_API_KEY', 'anthropic_model',
      'DEEPSEEK_API_KEY', 'deepseek_model',
      'OPENROUTER_API_KEY', 'openrouter_model',
      'enable_prompt_input',
      'answer_text_color', 'answer_font_size',
      'button_bg_color', 'button_size',
      'prompt_bg_color', 'prompt_width',
      'settings_btn_bg_color', 'settings_btn_size',
      'glass_refraction'
    ], (data) => {
      if (chrome.runtime.lastError || !data) return;

      currentActiveProvider = data.ACTIVE_PROVIDER || data.activeProvider || 'gemini';

      // Provider API keys & Models
      for (const [pKey, cfg] of Object.entries(PROVIDERS)) {
        const keyInput = shadow.getElementById(cfg.keyInputId);
        if (keyInput) {
          keyInput.value = data[cfg.storageKey] || (cfg.altKey ? data[cfg.altKey] : '') || '';
        }

        const modelSelect = shadow.getElementById(cfg.modelSelectId);
        if (modelSelect) {
          const val = data[cfg.modelKey] || (cfg.altModelKey ? data[cfg.altModelKey] : '') || cfg.defaultModel;
          modelSelect.value = val;
        }

        const dot = shadow.getElementById(cfg.dotId);
        if (dot) {
          const hasKey = !!(data[cfg.storageKey] || (cfg.altKey ? data[cfg.altKey] : ''));
          dot.classList.toggle('configured', hasKey);
        }
      }

      // Appearance toggles & sliders
      const enablePrompt = shadow.getElementById('modal-enable-prompt-input');
      if (enablePrompt) {
        enablePrompt.checked = data.enable_prompt_input !== false;
      }

      const syncColor = (pickerId, hexId, colorVal, defaultHex) => {
        const p = shadow.getElementById(pickerId);
        const h = shadow.getElementById(hexId);
        const val = (colorVal || defaultHex).toUpperCase();
        if (p) p.value = val;
        if (h) h.value = val;
      };

      const syncSlider = (sliderId, badgeId, sliderVal, defaultVal, unit) => {
        const s = shadow.getElementById(sliderId);
        const b = shadow.getElementById(badgeId);
        const val = sliderVal != null ? sliderVal : defaultVal;
        if (s) s.value = val;
        if (b) b.textContent = `${val}${unit}`;
      };

      syncColor('modal-answer-color-picker', 'modal-answer-color-hex', data.answer_text_color, '#FFFFFF');
      syncSlider('modal-answer-font-size', 'modal-answer-font-size-val', data.answer_font_size, 14, 'px');

      syncColor('modal-button-color-picker', 'modal-button-color-hex', data.button_bg_color, '#FFFFFF');
      syncSlider('modal-button-size', 'modal-button-size-val', data.button_size, 30, 'px');

      syncColor('modal-prompt-color-picker', 'modal-prompt-color-hex', data.prompt_bg_color, '#FFFFFF');
      syncSlider('modal-prompt-width', 'modal-prompt-width-val', data.prompt_width, 180, 'px');

      syncColor('modal-settings-color-picker', 'modal-settings-color-hex', data.settings_btn_bg_color, '#FFFFFF');
      syncSlider('modal-settings-size', 'modal-settings-size-val', data.settings_btn_size, 32, 'px');

      // Glass refraction slider
      const glassVal = data.glass_refraction != null ? data.glass_refraction : 70;
      const glassS = shadow.getElementById('modal-glass-refraction');
      const glassB = shadow.getElementById('modal-glass-refraction-val');
      if (glassS) glassS.value = glassVal;
      if (glassB) glassB.textContent = `${glassVal}%`;

      switchModalProvider(currentActiveProvider);
    });
  }

  function autoSaveModal() {
    if (!isRuntimeValid() || !chrome.storage || !chrome.storage.local || !shadow) return;

    const dataToSave = {
      ACTIVE_PROVIDER: currentActiveProvider,
      activeProvider: currentActiveProvider
    };

    for (const [pKey, cfg] of Object.entries(PROVIDERS)) {
      const keyInput = shadow.getElementById(cfg.keyInputId);
      if (keyInput) {
        const val = keyInput.value.trim();
        dataToSave[cfg.storageKey] = val;
        if (cfg.altKey) dataToSave[cfg.altKey] = val;
        const dot = shadow.getElementById(cfg.dotId);
        if (dot) dot.classList.toggle('configured', !!val);
      }

      const modelSelect = shadow.getElementById(cfg.modelSelectId);
      if (modelSelect) {
        dataToSave[cfg.modelKey] = modelSelect.value;
        if (cfg.altModelKey) dataToSave[cfg.altModelKey] = modelSelect.value;
      }
    }

    const enablePrompt = shadow.getElementById('modal-enable-prompt-input');
    if (enablePrompt) {
      dataToSave.enable_prompt_input = enablePrompt.checked;
    }

    const getVal = (id, fallback) => {
      const el = shadow.getElementById(id);
      return el ? el.value : fallback;
    };

    const newAppearance = {
      enable_prompt_input: enablePrompt ? enablePrompt.checked : true,
      answer_text_color: getVal('modal-answer-color-picker', '#FFFFFF'),
      answer_font_size: parseInt(getVal('modal-answer-font-size', 14), 10),
      button_bg_color: getVal('modal-button-color-picker', '#FFFFFF'),
      button_size: parseInt(getVal('modal-button-size', 30), 10),
      prompt_bg_color: getVal('modal-prompt-color-picker', '#FFFFFF'),
      prompt_width: parseInt(getVal('modal-prompt-width', 180), 10),
      settings_btn_bg_color: getVal('modal-settings-color-picker', '#FFFFFF'),
      settings_btn_size: parseInt(getVal('modal-settings-size', 32), 10),
      glass_refraction: parseInt(getVal('modal-glass-refraction', 70), 10)
    };

    Object.assign(dataToSave, newAppearance);

    chrome.storage.local.set(dataToSave, () => {
      applyAppearanceSettings(newAppearance);
      updateModalProviderStatus();
      showModalToast('Saved');
    });
  }

  async function testModalConnection() {
    if (!shadow) return;
    const testBtn = shadow.getElementById('modal-test-btn');
    const feedback = shadow.getElementById('modal-feedback-message');
    const cfg = PROVIDERS[currentActiveProvider];
    if (!cfg || !testBtn || !feedback) return;

    const keyInput = shadow.getElementById(cfg.keyInputId);
    const key = keyInput ? keyInput.value.trim() : '';
    const modelSelect = shadow.getElementById(cfg.modelSelectId);
    const model = modelSelect ? modelSelect.value : cfg.defaultModel;

    if (!key) {
      feedback.className = 'modal-feedback-message modal-feedback-error show';
      feedback.textContent = `Error: Please enter an API key for ${cfg.name} first.`;
      return;
    }

    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';
    feedback.className = 'modal-feedback-message';
    feedback.textContent = '';

    try {
      const testConfig = cfg.getTestConfig(key, model);
      const res = await fetch(testConfig.url, {
        method: testConfig.method,
        headers: testConfig.headers,
        body: testConfig.body
      });

      if (res.ok) {
        feedback.className = 'modal-feedback-message modal-feedback-success show';
        feedback.textContent = `Success: Connected to ${cfg.name} successfully!`;
      } else {
        const text = await res.text();
        let errMsg = `HTTP ${res.status}`;
        try {
          const j = JSON.parse(text);
          errMsg = j.error?.message || j.message || errMsg;
        } catch (_) {
          errMsg = text.slice(0, 120) || errMsg;
        }
        feedback.className = 'modal-feedback-message modal-feedback-error show';
        feedback.textContent = `Connection failed (${res.status}): ${errMsg}`;
      }
    } catch (err) {
      feedback.className = 'modal-feedback-message modal-feedback-error show';
      feedback.textContent = `Network error: ${err.message || 'Failed to reach endpoint'}`;
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = 'Test Active Provider Connection';
    }
  }

  // Listen for messages from background / popup
  if (isRuntimeValid()) {
    try {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!msg) return;

        if (msg.action === 'OPEN_SETTINGS_MODAL') {
          openSettingsModal();
          sendResponse({ success: true });
          return;
        }

        if (msg.action === 'TOGGLE_SETTINGS_MODAL') {
          toggleSettingsModal();
          sendResponse({ success: true });
          return;
        }

        const target = msg.targetElement || msg.target;
        if ((msg.action === 'START_POSITION_PICKER' || msg.action === 'ACTIVATE_POSITION_PICKER') && target) {
          startPositionPicker(target);
          sendResponse({ success: true });
        }
        if (msg.action === 'RESET_POSITION' && target) {
          positions[target] = null;
          try {
            chrome.storage.local.remove([target + '_position', 'pos_' + target]);
          } catch (_) {}
          resetTargetPosition(target);
          sendResponse({ success: true });
        }
        if (msg.action === 'UPDATE_SETTINGS' && msg.settings) {
          applyAppearanceSettings(msg.settings);
          sendResponse({ success: true });
        }
      });
    } catch (_) {}
  }

  function createShadowUI() {
    host = document.createElement('div');
    host.id = 'academic-solver-root';
    host.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 0 !important; height: 0 !important; z-index: 2147483647 !important; pointer-events: none !important; border: none !important; margin: 0 !important; padding: 0 !important;';

    shadow = host.attachShadow({ mode: 'open' });

    // Link external content.css stylesheet for full styling inside Shadow DOM
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = chrome.runtime.getURL('content.css');
    shadow.appendChild(cssLink);

    hiddenToggleZone = document.createElement('div');
    hiddenToggleZone.id = 'hidden-toggle-zone';

    uiWrapper = document.createElement('div');
    uiWrapper.id = 'solver-ui-wrapper';
    uiWrapper.style.display = isUIVisible ? 'block' : 'none';

    bottomControlsBar = document.createElement('div');
    bottomControlsBar.id = 'bottom-controls-bar';

    promptInput = document.createElement('input');
    promptInput.id = 'prompt-input';
    promptInput.type = 'text';
    promptInput.placeholder = 'Custom instruction...';
    promptInput.autocomplete = 'off';
    promptInput.spellcheck = false;

    promptInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        captureButton.click();
      }
    });
    promptInput.addEventListener('keyup', (e) => e.stopPropagation());
    promptInput.addEventListener('keypress', (e) => e.stopPropagation());

    captureButton = document.createElement('button');
    captureButton.id = 'capture-button';
    captureButton.setAttribute('type', 'button');
    captureButton.setAttribute('title', 'Capture & Solve');
    captureButton.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <circle cx="12" cy="12" r="3.5"></circle>
        <line x1="12" y1="2" x2="12" y2="5"></line>
        <line x1="12" y1="19" x2="12" y2="22"></line>
        <line x1="2" y1="12" x2="5" y2="12"></line>
        <line x1="19" y1="12" x2="22" y2="12"></line>
      </svg>
    `;

    bottomControlsBar.appendChild(promptInput);
    bottomControlsBar.appendChild(captureButton);

    // Floating Settings Button (draggable & clickable)
    settingsButton = document.createElement('button');
    settingsButton.id = 'settings-button';
    settingsButton.setAttribute('type', 'button');
    settingsButton.setAttribute('title', 'SABIS Killer Settings (Drag to reposition)');
    settingsButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    `;

    // Interactive Dragging & Click Handling for Settings Button
    let isDraggingSettings = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialBtnX = 0;
    let initialBtnY = 0;
    let dragDistance = 0;

    settingsButton.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDraggingSettings = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragDistance = 0;

      const rect = settingsButton.getBoundingClientRect();
      initialBtnX = rect.left;
      initialBtnY = rect.top;

      e.preventDefault();
      e.stopPropagation();

      function onMouseMove(moveEvent) {
        if (!isDraggingSettings) return;
        const dx = moveEvent.clientX - dragStartX;
        const dy = moveEvent.clientY - dragStartY;
        dragDistance = Math.hypot(dx, dy);

        if (dragDistance > 3) {
          let nextX = initialBtnX + dx;
          let nextY = initialBtnY + dy;
          const btnW = settingsButton.offsetWidth || 32;
          const btnH = settingsButton.offsetHeight || 32;
          nextX = Math.max(4, Math.min(window.innerWidth - btnW - 4, nextX));
          nextY = Math.max(4, Math.min(window.innerHeight - btnH - 4, nextY));

          applyTargetPosition('settings', nextX, nextY);
        }
      }

      function onMouseUp(upEvent) {
        if (!isDraggingSettings) return;
        isDraggingSettings = false;
        window.removeEventListener('mousemove', onMouseMove, true);
        window.removeEventListener('mouseup', onMouseUp, true);

        if (dragDistance > 3) {
          const rect = settingsButton.getBoundingClientRect();
          const posX = Math.round(rect.left);
          const posY = Math.round(rect.top);
          positions.settings = { x: posX, y: posY };
          try {
            chrome.storage.local.set({
              settings_position: { x: posX, y: posY },
              pos_settings: { x: posX, y: posY }
            });
          } catch (_) {}
        } else {
          toggleSettingsModal();
        }
      }

      window.addEventListener('mousemove', onMouseMove, true);
      window.addEventListener('mouseup', onMouseUp, true);
    });

    answerContainer = document.createElement('div');
    answerContainer.id = 'answer-display-container';

    answerText = document.createElement('div');
    answerText.id = 'answer-text';
    answerText.textContent = formatAnswerForBar(currentAnswerText);

    answerContainer.appendChild(answerText);

    modelBadge = document.createElement('span');
    modelBadge.id = 'model-badge';
    answerContainer.appendChild(modelBadge);

    uiWrapper.appendChild(bottomControlsBar);
    uiWrapper.appendChild(settingsButton);
    uiWrapper.appendChild(answerContainer);

    // ── Build In-Page Settings Modal DOM Tree ────────────────────────────────
    settingsModalBackdrop = document.createElement('div');
    settingsModalBackdrop.id = 'settings-modal-backdrop';

    settingsModalDialog = document.createElement('div');
    settingsModalDialog.id = 'settings-modal-dialog';
    settingsModalDialog.innerHTML = `
      <div id="modal-save-toast">
        <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor">
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
        </svg>
        <span>Saved</span>
      </div>

      <div id="settings-modal-header">
        <div class="modal-logo-area">
          <div class="modal-logo-dot"></div>
          <h1 class="modal-header-title">SABIS KILLER <span class="modal-version-tag">v1.5</span></h1>
        </div>
        <div class="modal-header-right">
          <div id="settings-modal-status-badge" class="status-missing">
            <span class="modal-status-dot"></span>
            <span id="settings-modal-status-text">No Key</span>
          </div>
          <button type="button" id="settings-modal-close" title="Close Settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div id="settings-modal-content">
        <div class="modal-section-desc">
          Choose your active AI provider, customize in-page controls, and reposition elements anywhere on screen.
        </div>

        <div class="modal-form-group">
          <label>Active AI Provider</label>
          <div class="modal-provider-nav">
            <button type="button" class="modal-provider-btn active" data-provider="gemini" id="modal-btn-provider-gemini">
              <span class="modal-provider-dot" id="modal-dot-gemini"></span>
              <span>Google</span>
            </button>
            <button type="button" class="modal-provider-btn" data-provider="openai" id="modal-btn-provider-openai">
              <span class="modal-provider-dot" id="modal-dot-openai"></span>
              <span>OpenAI</span>
            </button>
            <button type="button" class="modal-provider-btn" data-provider="anthropic" id="modal-btn-provider-anthropic">
              <span class="modal-provider-dot" id="modal-dot-anthropic"></span>
              <span>Anthropic</span>
            </button>
            <button type="button" class="modal-provider-btn" data-provider="deepseek" id="modal-btn-provider-deepseek">
              <span class="modal-provider-dot" id="modal-dot-deepseek"></span>
              <span>DeepSeek</span>
            </button>
            <button type="button" class="modal-provider-btn" data-provider="openrouter" id="modal-btn-provider-openrouter">
              <span class="modal-provider-dot" id="modal-dot-openrouter"></span>
              <span>OpenRouter</span>
            </button>
          </div>
        </div>

        <!-- Google Gemini Card -->
        <div class="modal-provider-card" id="modal-card-gemini">
          <div class="modal-card-header">
            <span class="modal-card-title">Google Gemini Configuration</span>
            <span class="modal-card-badge active" id="modal-badge-gemini">Active</span>
          </div>
          <div class="modal-form-group">
            <label for="modal-apiKey-gemini">Gemini API Key</label>
            <div class="modal-input-wrapper">
              <input type="password" id="modal-apiKey-gemini" placeholder="AIzaSy..." autocomplete="off" spellcheck="false" />
              <button type="button" class="modal-icon-btn modal-toggle-visibility" data-target="modal-apiKey-gemini" title="Toggle visibility">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </div>
            <p class="modal-api-help">Get key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a></p>
          </div>
          <div class="modal-form-group">
            <label for="modal-google-models">Model / Routing Strategy</label>
            <select id="modal-google-models" class="modal-select">
              <optgroup label="Auto-Dynamic Routing (Recommended)">
                <option value="auto_dynamic_paid" selected>Auto-Dynamic (Paid Models) [Default] — Smart Heuristic</option>
                <option value="auto_dynamic_free">Auto-Dynamic (Free Models) — Rate-Limit Safe Heuristic</option>
              </optgroup>
              <optgroup label="Gemini 3.8 Series">
                <option value="gemini-3.8-flash">gemini-3.8-flash (High Reasoning, Math, Coding)</option>
                <option value="gemini-3.8-flash-lite">gemini-3.8-flash-lite (High Speed, Low Latency)</option>
              </optgroup>
              <optgroup label="Gemini 3.7 Series">
                <option value="gemini-3.7-flash">gemini-3.7-flash (Deprecation fallback → 3.8-flash)</option>
                <option value="gemini-3.7-flash-lite">gemini-3.7-flash-lite</option>
              </optgroup>
              <optgroup label="Gemini 3.6 Series">
                <option value="gemini-3.6-flash">gemini-3.6-flash [Free] (Rapid Agent Loops)</option>
                <option value="gemini-3.6-flash-lite">gemini-3.6-flash-lite [Free]</option>
              </optgroup>
              <optgroup label="Gemini 3.5 Series">
                <option value="gemini-3.5-flash">gemini-3.5-flash [Free] (Ultra-fast Vision)</option>
                <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite [Free] (Ultra Low-Cost)</option>
              </optgroup>
            </select>
          </div>
        </div>

        <!-- OpenAI Card -->
        <div class="modal-provider-card" id="modal-card-openai" style="display: none;">
          <div class="modal-card-header">
            <span class="modal-card-title">OpenAI Configuration</span>
            <span class="modal-card-badge" id="modal-badge-openai">Inactive</span>
          </div>
          <div class="modal-form-group">
            <label for="modal-apiKey-openai">OpenAI API Key</label>
            <div class="modal-input-wrapper">
              <input type="password" id="modal-apiKey-openai" placeholder="sk-..." autocomplete="off" spellcheck="false" />
              <button type="button" class="modal-icon-btn modal-toggle-visibility" data-target="modal-apiKey-openai" title="Toggle visibility">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </div>
            <p class="modal-api-help">Get key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">OpenAI Platform</a></p>
          </div>
          <div class="modal-form-group">
            <label for="modal-openai-models">Model / Routing Strategy</label>
            <select id="modal-openai-models" class="modal-select">
              <option value="auto_free" selected>Auto (Free) — gpt-5.4-mini / OpenRouter router</option>
              <option value="auto_paid">Auto (Free + Paid) — gpt-5.5 with fallback on 429</option>
              <option value="gpt-5.5">gpt-5.5 [Paid] (Flagship reasoning & agentic tasks)</option>
              <option value="gpt-5.5-pro">gpt-5.5-pro [Paid] (Extended reasoning tier)</option>
              <option value="gpt-5.4">gpt-5.4 [Paid] (Standard production workhorse)</option>
              <option value="gpt-5.4-mini">gpt-5.4-mini [Paid] (High-volume efficient tier)</option>
              <option value="gpt-5.4-nano">gpt-5.4-nano [Paid] (Fastest low-cost endpoint)</option>
              <option value="o3">o3 [Paid] (Deep mathematical proofs & planning)</option>
              <option value="o3-pro">o3-pro [Paid] (Maximum compute reasoning tier)</option>
              <option value="o4-mini">o4-mini [Paid] (Fast step-by-step reasoning)</option>
              <option value="gpt-4o">gpt-4o [Paid] (Legacy multimodal workhorse)</option>
            </select>
          </div>
        </div>

        <!-- Anthropic Card -->
        <div class="modal-provider-card" id="modal-card-anthropic" style="display: none;">
          <div class="modal-card-header">
            <span class="modal-card-title">Anthropic Claude Configuration</span>
            <span class="modal-card-badge" id="modal-badge-anthropic">Inactive</span>
          </div>
          <div class="modal-form-group">
            <label for="modal-apiKey-anthropic">Anthropic API Key</label>
            <div class="modal-input-wrapper">
              <input type="password" id="modal-apiKey-anthropic" placeholder="sk-ant-..." autocomplete="off" spellcheck="false" />
              <button type="button" class="modal-icon-btn modal-toggle-visibility" data-target="modal-apiKey-anthropic" title="Toggle visibility">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </div>
            <p class="modal-api-help">Get key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">Anthropic Console</a></p>
          </div>
          <div class="modal-form-group">
            <label for="modal-anthropic-models">Model / Routing Strategy</label>
            <select id="modal-anthropic-models" class="modal-select">
              <option value="auto_paid" selected>Auto (Free + Paid) — claude-fable-5.1 with fallback</option>
              <option value="claude-fable-5.1">claude-fable-5.1 [Paid] (Mythos-class reasoning)</option>
              <option value="claude-opus-5.5">claude-opus-5.5 [Paid] (Supreme deep logic)</option>
              <option value="claude-sonnet-5.5">claude-sonnet-5.5 [Paid] (Coding & visual analysis)</option>
              <option value="claude-haiku-5.5">claude-haiku-5.5 [Paid] (Fast lightweight execution)</option>
              <option value="claude-sonnet-5">claude-sonnet-5 [Paid] (Balanced multimodal)</option>
              <option value="claude-opus-4.8">claude-opus-4.8 [Paid] (Scientific reasoning)</option>
            </select>
          </div>
        </div>

        <!-- DeepSeek Card -->
        <div class="modal-provider-card" id="modal-card-deepseek" style="display: none;">
          <div class="modal-card-header">
            <span class="modal-card-title">DeepSeek Configuration</span>
            <span class="modal-card-badge" id="modal-badge-deepseek">Inactive</span>
          </div>
          <div class="modal-form-group">
            <label for="modal-apiKey-deepseek">DeepSeek API Key</label>
            <div class="modal-input-wrapper">
              <input type="password" id="modal-apiKey-deepseek" placeholder="sk-..." autocomplete="off" spellcheck="false" />
              <button type="button" class="modal-icon-btn modal-toggle-visibility" data-target="modal-apiKey-deepseek" title="Toggle visibility">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </div>
            <p class="modal-api-help">Get key at <a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer">DeepSeek Platform</a></p>
          </div>
          <div class="modal-form-group">
            <label for="modal-deepseek-models">Model / Routing Strategy</label>
            <select id="modal-deepseek-models" class="modal-select">
              <option value="auto_free" selected>Auto (Free) — deepseek-v4-flash</option>
              <option value="auto_paid">Auto (Free + Paid) — deepseek-v4-pro with fallback</option>
              <option value="deepseek-v4-pro">deepseek-v4-pro [Paid] (Flagship 1.6T parameter model)</option>
              <option value="deepseek-v4-flash">deepseek-v4-flash [Free] (Ultra-fast endpoint)</option>
            </select>
          </div>
        </div>

        <!-- OpenRouter Card -->
        <div class="modal-provider-card" id="modal-card-openrouter" style="display: none;">
          <div class="modal-card-header">
            <span class="modal-card-title">OpenRouter Configuration</span>
            <span class="modal-card-badge" id="modal-badge-openrouter">Inactive</span>
          </div>
          <div class="modal-form-group">
            <label for="modal-apiKey-openrouter">OpenRouter API Key</label>
            <div class="modal-input-wrapper">
              <input type="password" id="modal-apiKey-openrouter" placeholder="sk-or-v1-..." autocomplete="off" spellcheck="false" />
              <button type="button" class="modal-icon-btn modal-toggle-visibility" data-target="modal-apiKey-openrouter" title="Toggle visibility">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </div>
            <p class="modal-api-help">Get key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">OpenRouter.ai</a></p>
          </div>
          <div class="modal-form-group">
            <label for="modal-openrouter-models">Model / Routing Strategy</label>
            <select id="modal-openrouter-models" class="modal-select">
              <option value="auto_free" selected>Auto (Free) — openrouter/free</option>
              <option value="auto_paid">Auto (Free + Paid) — openrouter/auto with fallback</option>
              <option value="openrouter/auto">openrouter/auto [Paid] (Dynamic paid router)</option>
              <option value="openrouter/free">openrouter/free [Free] (Dynamic free router)</option>
              <option value="deepseek/deepseek-r1:free">deepseek/deepseek-r1:free [Free]</option>
              <option value="meta-llama/llama-3.3-70b-instruct:free">meta-llama/llama-3.3-70b-instruct:free [Free]</option>
              <option value="qwen/qwq-32b:free">qwen/qwq-32b:free [Free]</option>
              <option value="google/gemini-2.5-flash:free">google/gemini-2.5-flash:free [Free]</option>
            </select>
          </div>
        </div>

        <!-- Connection Test -->
        <div class="modal-actions">
          <button type="button" id="modal-test-btn" class="modal-btn-secondary">Test Active Provider Connection</button>
        </div>
        <div id="modal-feedback-message" class="modal-feedback-message"></div>

        <hr class="modal-divider" />

        <!-- Appearance Customization Section -->
        <div class="modal-settings-section">
          <div class="modal-section-title-row">
            <h2>Interface Customization &amp; Repositioning</h2>
          </div>

          <!-- Global Liquid Glass & Refraction Intensity -->
          <div class="modal-appearance-card">
            <span class="modal-appearance-card-title">&#10024; Global Liquid Glass &amp; Refraction</span>
            <div class="modal-appearance-row">
              <div class="modal-slider-label-row">
                <label>Glass Intensity</label>
                <span id="modal-glass-refraction-val" class="modal-val-badge">70%</span>
              </div>
              <input type="range" id="modal-glass-refraction" class="modal-range-slider" min="0" max="100" value="70" step="1">
              <span class="modal-subtext" style="font-size:10.5px; margin-top:3px; line-height:1.4;">
                0% = solid opaque &nbsp;&bull;&nbsp; 70% = standard glass &nbsp;&bull;&nbsp; 100% = ultra liquid glass
              </span>
            </div>
          </div>

          <div class="modal-toggle-row">
            <label class="modal-toggle-label" for="modal-enable-prompt-input">
              <span class="modal-toggle-title">Enable Custom Instruction Prompt Bar</span>
              <span class="modal-subtext">Shows an inline prompt field next to the screenshot button</span>
            </label>
            <label class="modal-switch">
              <input type="checkbox" id="modal-enable-prompt-input" checked>
              <span class="modal-slider"></span>
            </label>
          </div>

          <!-- Answer Text Settings -->
          <div class="modal-appearance-card">
            <span class="modal-appearance-card-title">Answer Text Overlay</span>
            <div class="modal-appearance-row">
              <label>Text Color</label>
              <div class="modal-color-picker-group">
                <input type="color" id="modal-answer-color-picker" class="modal-color-input" value="#FFFFFF">
                <input type="text" id="modal-answer-color-hex" class="modal-hex-text-input" value="#FFFFFF" maxlength="7">
              </div>
            </div>
            <div class="modal-appearance-row">
              <div class="modal-slider-label-row">
                <label>Font Size</label>
                <span id="modal-answer-font-size-val" class="modal-val-badge">14px</span>
              </div>
              <input type="range" id="modal-answer-font-size" class="modal-range-slider" min="10" max="28" value="14" step="1">
            </div>
            <div class="modal-position-row">
              <button type="button" class="modal-change-pos-btn" data-target="answer">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>
                </svg>
                <span>Change Position</span>
              </button>
              <button type="button" class="modal-reset-pos-btn" data-target="answer">Reset</button>
            </div>
          </div>

          <!-- Screenshot Trigger Button Settings -->
          <div class="modal-appearance-card">
            <span class="modal-appearance-card-title">Screenshot Trigger Button</span>
            <div class="modal-appearance-row">
              <label>Button Background Tint</label>
              <div class="modal-color-picker-group">
                <input type="color" id="modal-button-color-picker" class="modal-color-input" value="#FFFFFF">
                <input type="text" id="modal-button-color-hex" class="modal-hex-text-input" value="#FFFFFF" maxlength="7">
              </div>
            </div>
            <div class="modal-appearance-row">
              <div class="modal-slider-label-row">
                <label>Button Diameter</label>
                <span id="modal-button-size-val" class="modal-val-badge">30px</span>
              </div>
              <input type="range" id="modal-button-size" class="modal-range-slider" min="20" max="64" value="30" step="2">
            </div>
            <div class="modal-position-row">
              <button type="button" class="modal-change-pos-btn" data-target="button">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>
                </svg>
                <span>Change Position</span>
              </button>
              <button type="button" class="modal-reset-pos-btn" data-target="button">Reset</button>
            </div>
          </div>

          <!-- Custom Instruction Prompt Box Settings -->
          <div class="modal-appearance-card">
            <span class="modal-appearance-card-title">Prompt Input Bar</span>
            <div class="modal-appearance-row">
              <label>Input Background Tint</label>
              <div class="modal-color-picker-group">
                <input type="color" id="modal-prompt-color-picker" class="modal-color-input" value="#FFFFFF">
                <input type="text" id="modal-prompt-color-hex" class="modal-hex-text-input" value="#FFFFFF" maxlength="7">
              </div>
            </div>
            <div class="modal-appearance-row">
              <div class="modal-slider-label-row">
                <label>Input Bar Width</label>
                <span id="modal-prompt-width-val" class="modal-val-badge">180px</span>
              </div>
              <input type="range" id="modal-prompt-width" class="modal-range-slider" min="120" max="400" value="180" step="10">
            </div>
            <div class="modal-position-row">
              <button type="button" class="modal-change-pos-btn" data-target="prompt">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>
                </svg>
                <span>Change Position</span>
              </button>
              <button type="button" class="modal-reset-pos-btn" data-target="prompt">Reset</button>
            </div>
          </div>

          <!-- Floating Settings Button Customization -->
          <div class="modal-appearance-card">
            <span class="modal-appearance-card-title">Floating Settings Trigger Icon</span>
            <div class="modal-appearance-row">
              <label>Icon Background Tint</label>
              <div class="modal-color-picker-group">
                <input type="color" id="modal-settings-color-picker" class="modal-color-input" value="#FFFFFF">
                <input type="text" id="modal-settings-color-hex" class="modal-hex-text-input" value="#FFFFFF" maxlength="7">
              </div>
            </div>
            <div class="modal-appearance-row">
              <div class="modal-slider-label-row">
                <label>Icon Diameter</label>
                <span id="modal-settings-size-val" class="modal-val-badge">32px</span>
              </div>
              <input type="range" id="modal-settings-size" class="modal-range-slider" min="20" max="60" value="32" step="2">
            </div>
            <div class="modal-position-row">
              <button type="button" class="modal-change-pos-btn" data-target="settings">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>
                </svg>
                <span>Change Position</span>
              </button>
              <button type="button" class="modal-reset-pos-btn" data-target="settings">Reset</button>
            </div>
          </div>

        </div>

        <!-- Quick Guide -->
        <div class="modal-guide-box">
          <h3>Quick Tips</h3>
          <ul>
            <li><strong>Repositioning:</strong> Drag the gear button directly on the page, or click "Change Position" to place any element.</li>
            <li><strong>Auto-Save:</strong> All API keys, model choices, and sliders save automatically in real time.</li>
            <li><strong>Stealth Mode:</strong> Click the invisible bottom-left corner zone to instantly hide or reveal all UI controls.</li>
          </ul>
        </div>

      </div>
    `;

    shadow.appendChild(hiddenToggleZone);
    shadow.appendChild(uiWrapper);
    shadow.appendChild(settingsModalBackdrop);
    shadow.appendChild(settingsModalDialog);

    modalSaveToast = shadow.getElementById('modal-save-toast');

    // ── Attach Modal Event Listeners ─────────────────────────────────────────

    // Close button & Backdrop click
    const closeBtn = shadow.getElementById('settings-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => closeSettingsModal());
    settingsModalBackdrop.addEventListener('click', () => closeSettingsModal());

    // Provider Tabs
    shadow.querySelectorAll('.modal-provider-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prov = btn.getAttribute('data-provider');
        switchModalProvider(prov);
      });
    });

    // Eye toggle buttons
    shadow.querySelectorAll('.modal-toggle-visibility').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = shadow.getElementById(targetId);
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.innerHTML = isPassword
          ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
          : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
      });
    });

    // Test Connection Button
    const testBtn = shadow.getElementById('modal-test-btn');
    if (testBtn) testBtn.addEventListener('click', testModalConnection);

    // Color Pickers & Sliders Live Sync
    function bindColorSync(pickerId, hexId) {
      const picker = shadow.getElementById(pickerId);
      const hex = shadow.getElementById(hexId);
      if (!picker || !hex) return;

      picker.addEventListener('input', () => {
        hex.value = picker.value.toUpperCase();
        autoSaveModal();
      });

      hex.addEventListener('input', () => {
        let val = hex.value.trim();
        if (!val.startsWith('#') && val.length > 0) val = '#' + val;
        if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
          picker.value = val;
          autoSaveModal();
        }
      });

      hex.addEventListener('blur', () => {
        let val = hex.value.trim();
        if (!val.startsWith('#') && val.length > 0) val = '#' + val;
        if (!/^#[0-9A-Fa-f]{6}$/.test(val)) {
          hex.value = picker.value.toUpperCase();
        } else {
          hex.value = val.toUpperCase();
          picker.value = val.toUpperCase();
          autoSaveModal();
        }
      });
    }

    function bindSliderSync(sliderId, badgeId, unit) {
      const slider = shadow.getElementById(sliderId);
      const badge = shadow.getElementById(badgeId);
      if (!slider || !badge) return;
      slider.addEventListener('input', () => {
        badge.textContent = `${slider.value}${unit}`;
        autoSaveModal();
      });
    }

    bindColorSync('modal-answer-color-picker', 'modal-answer-color-hex');
    bindSliderSync('modal-answer-font-size', 'modal-answer-font-size-val', 'px');

    bindColorSync('modal-button-color-picker', 'modal-button-color-hex');
    bindSliderSync('modal-button-size', 'modal-button-size-val', 'px');

    bindColorSync('modal-prompt-color-picker', 'modal-prompt-color-hex');
    bindSliderSync('modal-prompt-width', 'modal-prompt-width-val', 'px');

    bindColorSync('modal-settings-color-picker', 'modal-settings-color-hex');
    bindSliderSync('modal-settings-size', 'modal-settings-size-val', 'px');

    // Glass refraction slider — live update CSS custom properties + inline button styles
    const glassSlider = shadow.getElementById('modal-glass-refraction');
    const glassValBadge = shadow.getElementById('modal-glass-refraction-val');
    if (glassSlider && glassValBadge) {
      glassSlider.addEventListener('input', () => {
        glassValBadge.textContent = `${glassSlider.value}%`;
        autoSaveModal();
      });
    }

    const promptToggle = shadow.getElementById('modal-enable-prompt-input');
    if (promptToggle) promptToggle.addEventListener('change', autoSaveModal);

    // Auto-save on input/change across all keys and models
    [
      'modal-apiKey-gemini', 'modal-apiKey-openai', 'modal-apiKey-anthropic', 'modal-apiKey-deepseek', 'modal-apiKey-openrouter',
      'modal-google-models', 'modal-openai-models', 'modal-anthropic-models', 'modal-deepseek-models', 'modal-openrouter-models'
    ].forEach(id => {
      const el = shadow.getElementById(id);
      if (el) {
        el.addEventListener('input', () => autoSaveModal());
        el.addEventListener('change', () => autoSaveModal());
        el.addEventListener('blur', () => autoSaveModal());
      }
    });

    // "Change Position" buttons inside Modal
    shadow.querySelectorAll('.modal-change-pos-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = btn.getAttribute('data-target');
        startPositionPicker(target);
      });
    });

    // "Reset Position" buttons inside Modal
    shadow.querySelectorAll('.modal-reset-pos-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = btn.getAttribute('data-target');
        positions[target] = null;
        try {
          chrome.storage.local.remove([`${target}_position`, `pos_${target}`], () => {
            resetTargetPosition(target);
            showModalToast('Position Reset');
          });
        } catch (_) {
          resetTargetPosition(target);
        }
      });
    });

    loadStoredSettings();

    hiddenToggleZone.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      isUIVisible = !isUIVisible;
      uiWrapper.style.display = isUIVisible ? 'block' : 'none';
    });

    captureButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      captureButton.classList.add('flash-confirm');
      setTimeout(() => {
        captureButton.classList.remove('flash-confirm');
      }, 300);

      if (isSolving) return;

      if (!isRuntimeValid()) {
        currentAnswerText = 'Extension reloaded — please refresh this page (F5).';
        if (answerText) answerText.textContent = currentAnswerText;
        return;
      }

      isSolving = true;
      currentAnswerText = 'Solving...';
      answerText.textContent = currentAnswerText;

      const customPrompt = promptInput ? promptInput.value.trim() : '';

      try {
        chrome.runtime.sendMessage({ action: 'SOLVE_SCREEN', customPrompt }, (response) => {
          isSolving = false;

          let lastErr = null;
          try { lastErr = chrome.runtime.lastError; } catch (_) {}

          if (lastErr) {
            const msg = lastErr.message || String(lastErr);
            currentAnswerText = msg.includes('context') || msg.includes('receiving end')
              ? 'Extension reloaded — please refresh this page (F5).'
              : `Error: ${msg}`;
          } else if (!response) {
            currentAnswerText = 'Error: No response from background service worker.';
          } else if (!response.success) {
            currentAnswerText = response.error || 'Failed to analyze screenshot.';
          } else {
            currentAnswerText = response.answer;
            if (modelBadge && response.modelUsed) {
              modelBadge.textContent = response.modelUsed;
              modelBadge.style.setProperty('display', 'inline-block', 'important');
              modelBadge.title = `Mode: ${response.modeActive || ''}${response.wasFallbackTriggered ? ' [Fallback]' : ''}`;
              if (response.wasFallbackTriggered) { modelBadge.classList.add('fallback'); }
              else { modelBadge.classList.remove('fallback'); }
            }
          }

          if (answerText) {
            answerText.textContent = formatAnswerForBar(currentAnswerText);
          }
          if (modelBadge && !response?.success) {
            modelBadge.style.setProperty('display', 'none', 'important');
          }
        });
      } catch (err) {
        isSolving = false;
        const msg = err?.message || String(err);
        currentAnswerText = msg.includes('context') || msg.includes('sendMessage')
          ? 'Extension reloaded — please refresh this page (F5).'
          : `Error: ${msg}`;
        if (answerText) {
          answerText.textContent = formatAnswerForBar(currentAnswerText);
        }
      }
    });
  }

  if (isRuntimeValid() && chrome.storage && chrome.storage.onChanged) {
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        const updated = {};
        for (const key of [
          'enable_prompt_input',
          'answer_text_color', 'answer_font_size',
          'button_bg_color', 'button_size',
          'prompt_bg_color', 'prompt_width',
          'settings_btn_bg_color', 'settings_btn_size',
          'glass_refraction'
        ]) {
          if (changes[key]) {
            updated[key] = changes[key].newValue;
          }
        }
        if (Object.keys(updated).length > 0) {
          applyAppearanceSettings(updated);
        }

        // Live-update positions
        ['button', 'prompt', 'answer', 'settings'].forEach(target => {
          const posKey = `${target}_position`;
          const altKey = `pos_${target}`;
          if (changes[posKey] || changes[altKey]) {
            const val = changes[posKey]?.newValue ?? changes[altKey]?.newValue;
            if (val && val.x != null && val.y != null) {
              positions[target] = val;
              applyTargetPosition(target, val.x, val.y);
            } else {
              positions[target] = null;
              resetTargetPosition(target);
            }
          }
        });
      });
    } catch (_) {}
  }

  function sanitizeAnswer(text) {
    if (!text) return '';
    return text
      .replace(/\$\$[\s\S]*?\$\$/g, '')
      .replace(/\$([^$\n]*?)\$/g, '$1')
      .replace(/\$/g, '')
      .replace(/\*\*([^*]*?)\*\*/g, '$1')
      .replace(/\*([^*\n]*?)\*/g, '$1')
      .replace(/^[\s]*[•\-\*]\s+/gm, '')
      .replace(/`([^`]*?)`/g, '$1')
      .replace(/  +/g, ' ')
      .trim();
  }

  function formatAnswerForBar(text) {
    if (!text) return '';
    if (text.startsWith('Error:') || text === 'Solving...' || text.startsWith('Extension') || text.includes('Please save your') || text.includes('error:')) return text;
    const sanitized = sanitizeAnswer(text);
    return sanitized
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('   |   ');
  }

  function ensureUI() {
    if (!host || !shadow) {
      createShadowUI();
    }

    if (!document.contains(host)) {
      const target = document.body || document.documentElement;
      if (target) {
        target.appendChild(host);
      }
    }

    if (uiWrapper) {
      uiWrapper.style.display = isUIVisible ? 'block' : 'none';
    }
    if (answerText && currentAnswerText) {
      answerText.textContent = formatAnswerForBar(currentAnswerText);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureUI);
  } else {
    ensureUI();
  }

  const observer = new MutationObserver(() => {
    if (!host || !document.contains(host)) {
      ensureUI();
    }
  });

  function startObserver() {
    const target = document.documentElement || document.body;
    if (target) {
      observer.observe(target, { childList: true, subtree: true });
    }
  }

  if (document.body) {
    startObserver();
  } else {
    document.addEventListener('DOMContentLoaded', startObserver);
  }

  window.addEventListener('popstate', () => setTimeout(ensureUI, 50));
  window.addEventListener('hashchange', () => setTimeout(ensureUI, 50));

  ['turbo:load', 'turbo:render', 'pjax:end', 'page:load'].forEach((evt) => {
    window.addEventListener(evt, () => setTimeout(ensureUI, 50));
  });

  const origPushState = history.pushState;
  if (origPushState) {
    history.pushState = function (...args) {
      const result = origPushState.apply(this, args);
      setTimeout(ensureUI, 50);
      return result;
    };
  }

  const origReplaceState = history.replaceState;
  if (origReplaceState) {
    history.replaceState = function (...args) {
      const result = origReplaceState.apply(this, args);
      setTimeout(ensureUI, 50);
      return result;
    };
  }
})();
