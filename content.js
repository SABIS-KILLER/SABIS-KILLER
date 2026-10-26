(() => {
  if (window.__ACADEMIC_SOLVER_INITIALIZED__) return;
  window.__ACADEMIC_SOLVER_INITIALIZED__ = true;

  let isUIVisible = true;
  let isSolving = false;
  let currentAnswerText = '';

  let appearance = {
    enable_prompt_input: true,
    answer_text_color: '#000000',
    answer_font_size: 13,
    button_bg_color: '#FFFFFF',
    button_size: 30,
    prompt_bg_color: '#FFFFFF',
    prompt_width: 180
  };

  // Stored positions for each repositionable element
  let positions = {
    button: null,    // { x, y } in px from viewport top-left
    prompt: null,
    answer: null
  };

  let activePickerTarget = null; // 'button' | 'prompt' | 'answer' | null
  let pickerOverlay = null;      // full-viewport transparent div injected into <body>

  let host = document.getElementById('academic-solver-root');
  let shadow = null;
  let bottomControlsBar = null;
  let promptInput = null;
  let captureButton = null;
  let answerContainer = null;
  let answerText = null;
  let modelBadge = null;
  let uiWrapper = null;
  let hiddenToggleZone = null;

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

  function applyAppearanceSettings(newSettings) {
    if (!newSettings) return;
    appearance = { ...appearance, ...newSettings };

    if (answerText) {
      if (appearance.answer_text_color) {
        answerText.style.setProperty('color', appearance.answer_text_color, 'important');
      }
      if (appearance.answer_font_size) {
        answerText.style.setProperty('font-size', `${appearance.answer_font_size}px`, 'important');
      }
    }

    if (captureButton) {
      const btnColor = appearance.button_bg_color || '#FFFFFF';
      const btnSize = parseInt(appearance.button_size, 10) || 30;
      const contrast = getContrastColor(btnColor);

      captureButton.style.setProperty('background-color', btnColor, 'important');
      captureButton.style.setProperty('width', `${btnSize}px`, 'important');
      captureButton.style.setProperty('height', `${btnSize}px`, 'important');
      captureButton.style.setProperty('border-color', contrast === '#000000' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.25)', 'important');

      const svg = captureButton.querySelector('svg');
      if (svg) {
        const iconSize = Math.max(5, Math.round(btnSize * 0.46));
        svg.setAttribute('width', iconSize);
        svg.setAttribute('height', iconSize);
        svg.style.setProperty('stroke', contrast, 'important');
      }
    }

    if (promptInput) {
      const isEnabled = appearance.enable_prompt_input !== false;
      promptInput.style.display = isEnabled ? 'block' : 'none';

      const pColor = appearance.prompt_bg_color || '#FFFFFF';
      const pWidth = parseInt(appearance.prompt_width, 10) || 180;
      const pContrast = getContrastColor(pColor);

      promptInput.style.setProperty('background-color', pColor, 'important');
      promptInput.style.setProperty('color', pContrast, 'important');
      promptInput.style.setProperty('width', `${pWidth}px`, 'important');
      promptInput.style.setProperty('border-color', pContrast === '#000000' ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)', 'important');
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
    } else if (target === 'answer' && answerContainer) {
      answerContainer.style.setProperty('position', 'fixed', 'important');
      answerContainer.style.setProperty('top', `${y}px`, 'important');
      answerContainer.style.setProperty('left', `${x}px`, 'important');
      answerContainer.style.setProperty('bottom', 'auto', 'important');
      answerContainer.style.setProperty('right', 'auto', 'important');
      answerContainer.style.setProperty('width', 'auto', 'important');
      answerContainer.style.setProperty('max-width', '90vw', 'important');
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
    } else if (target === 'answer' && answerContainer) {
      answerContainer.style.removeProperty('top');
      answerContainer.style.removeProperty('right');
      answerContainer.style.removeProperty('max-width');
      answerContainer.style.setProperty('position', 'fixed', 'important');
      answerContainer.style.setProperty('bottom', '8px', 'important');
      answerContainer.style.setProperty('left', '8px', 'important');
      answerContainer.style.setProperty('width', 'calc(100% - 140px)', 'important');
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
        'button_position', 'pos_button',
        'prompt_position', 'pos_prompt',
        'answer_position', 'pos_answer'
      ], (data) => {
        if (chrome.runtime.lastError) return;
        applyAppearanceSettings(data);
        const btnPos = data.button_position || data.pos_button;
        const pPos = data.prompt_position || data.pos_prompt;
        const ansPos = data.answer_position || data.pos_answer;
        if (btnPos && btnPos.x != null && btnPos.y != null) positions.button = btnPos;
        if (pPos && pPos.x != null && pPos.y != null) positions.prompt = pPos;
        if (ansPos && ansPos.x != null && ansPos.y != null) positions.answer = ansPos;
        applyPositions();
      });
    } catch (_) {}
  }

  // ── Position Picker ─────────────────────────────────────────────────────────

  function startPositionPicker(targetElement) {
    // Remove any lingering picker overlay
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
      'background: rgba(0, 0, 0, 0.05)',
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
        });
      } catch (_) {}

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
      }
    }

    window.addEventListener('click', handleScreenClick, { capture: true, once: true });
    window.addEventListener('keydown', handleKeydown, { capture: true, once: true });
  }

  // Listen for messages from popup
  if (isRuntimeValid()) {
    try {
      chrome.runtime.onMessage.addListener((msg) => {
        if (!msg) return;
        const target = msg.targetElement || msg.target;
        if ((msg.action === 'START_POSITION_PICKER' || msg.action === 'ACTIVATE_POSITION_PICKER') && target) {
          startPositionPicker(target);
        }
        if (msg.action === 'RESET_POSITION' && target) {
          positions[target] = null;
          try {
            chrome.storage.local.remove([target + '_position', 'pos_' + target]);
          } catch (_) {}
          resetTargetPosition(target);
        }
        if (msg.action === 'UPDATE_SETTINGS' && msg.settings) {
          applyAppearanceSettings(msg.settings);
        }
      });
    } catch (_) {}
  }

  function createShadowUI() {
    host = document.createElement('div');
    host.id = 'academic-solver-root';
    host.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 0 !important; height: 0 !important; z-index: 2147483647 !important; pointer-events: none !important; border: none !important; margin: 0 !important; padding: 0 !important;';

    shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      * {
        box-sizing: border-box !important;
        margin: 0;
        padding: 0;
      }

      #hidden-toggle-zone {
        position: fixed !important;
        bottom: 0px !important;
        left: 0px !important;
        width: 2vw !important;
        height: 24px !important;
        min-width: 14px !important;
        z-index: 2147483647 !important;
        background: transparent !important;
        border: none !important;
        outline: none !important;
        cursor: default !important;
        pointer-events: auto !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        -webkit-tap-highlight-color: transparent;
      }

      #solver-ui-wrapper {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        pointer-events: none !important;
        z-index: 2147483646 !important;
      }

      #bottom-controls-bar {
        position: fixed !important;
        bottom: 8px !important;
        right: 8px !important;
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        z-index: 2147483647 !important;
        padding: 0 !important;
        box-sizing: border-box !important;
        max-width: 90vw !important;
        pointer-events: none !important;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }

      #prompt-input {
        background-color: #ffffff !important;
        color: #1c1c1e !important;
        border: 1px solid rgba(0, 0, 0, 0.15) !important;
        border-radius: 12px !important;
        padding: 5px 12px !important;
        font-size: 11.5px !important;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        outline: none !important;
        width: 180px !important;
        max-width: 60vw !important;
        box-sizing: border-box !important;
        pointer-events: auto !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.06) !important;
        transition: border-color 0.15s ease, box-shadow 0.15s ease, width 0.15s ease !important;
      }

      #prompt-input:focus {
        border-color: #007aff !important;
        box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.2) !important;
      }

      #prompt-input::placeholder {
        color: rgba(60, 60, 67, 0.5) !important;
        font-style: normal !important;
      }

      #capture-button {
        position: relative !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 32px !important;
        height: 32px !important;
        border-radius: 50% !important;
        background-color: #ffffff !important;
        border: 1px solid rgba(0, 0, 0, 0.15) !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08) !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 2147483647 !important;
        outline: none !important;
        pointer-events: auto !important;
        flex-shrink: 0 !important;
        transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease, background-color 0.15s ease !important;
        -webkit-tap-highlight-color: transparent;
      }

      #capture-button:hover {
        opacity: 0.92 !important;
        transform: scale(1.04) !important;
      }

      #capture-button:active {
        transform: scale(0.94) !important;
      }

      #capture-button svg {
        stroke: #1c1c1e !important;
        transition: stroke 0.1s ease !important;
        display: block !important;
        pointer-events: none !important;
      }

      #capture-button.flash-confirm {
        filter: invert(1) !important;
      }

      #answer-display-container {
        position: fixed !important;
        bottom: 8px !important;
        left: 8px !important;
        width: calc(100% - 140px) !important;
        height: 38px !important;
        background: rgba(255, 255, 255, 0.85) !important;
        backdrop-filter: blur(20px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
        border: 1px solid rgba(255, 255, 255, 0.6) !important;
        border-radius: 14px !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08) !important;
        pointer-events: none !important;
        z-index: 2147483646 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: flex-start !important;
        padding: 0 14px !important;
        box-sizing: border-box !important;
        white-space: nowrap !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        gap: 8px !important;
      }

      #answer-text {
        color: #1c1c1e !important;
        font-weight: 500 !important;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        font-size: 13px !important;
        line-height: 1.5 !important;
        text-shadow: none !important;
        user-select: none !important;
        white-space: nowrap !important;
        max-width: 100% !important;
        width: 100% !important;
      }

      #model-badge {
        display: none !important;
        font-size: 10px !important;
        font-weight: 600 !important;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", ui-monospace, SFMono-Regular, monospace !important;
        padding: 2px 7px !important;
        border-radius: 6px !important;
        background: rgba(0, 122, 255, 0.12) !important;
        color: #007aff !important;
        white-space: nowrap !important;
        flex-shrink: 0 !important;
        user-select: none !important;
        cursor: default !important;
        pointer-events: auto !important;
      }

      #model-badge.fallback {
        background: rgba(255, 149, 0, 0.16) !important;
        color: #ff9500 !important;
      }

    `;

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
    uiWrapper.appendChild(answerContainer);

    shadow.appendChild(style);
    shadow.appendChild(hiddenToggleZone);
    shadow.appendChild(uiWrapper);

    loadStoredSettings(); // also calls applyPositions() once storage is read

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
        for (const key of ['enable_prompt_input', 'answer_text_color', 'answer_font_size', 'button_bg_color', 'button_size', 'prompt_bg_color', 'prompt_width']) {
          if (changes[key]) {
            updated[key] = changes[key].newValue;
          }
        }
        if (Object.keys(updated).length > 0) {
          applyAppearanceSettings(updated);
        }

        // Restore / live-update saved positions
        if (changes.button_position || changes.pos_button) {
          const val = changes.button_position?.newValue ?? changes.pos_button?.newValue;
          if (val && val.x != null && val.y != null) {
            positions.button = val;
            applyTargetPosition('button', val.x, val.y);
          } else {
            positions.button = null;
            resetTargetPosition('button');
          }
        }

        if (changes.prompt_position || changes.pos_prompt) {
          const val = changes.prompt_position?.newValue ?? changes.pos_prompt?.newValue;
          if (val && val.x != null && val.y != null) {
            positions.prompt = val;
            applyTargetPosition('prompt', val.x, val.y);
          } else {
            positions.prompt = null;
            resetTargetPosition('prompt');
          }
        }

        if (changes.answer_position || changes.pos_answer) {
          const val = changes.answer_position?.newValue ?? changes.pos_answer?.newValue;
          if (val && val.x != null && val.y != null) {
            positions.answer = val;
            applyTargetPosition('answer', val.x, val.y);
          } else {
            positions.answer = null;
            resetTargetPosition('answer');
          }
        }
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
