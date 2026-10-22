(() => {
  if (window.__ACADEMIC_SOLVER_INITIALIZED__) return;
  window.__ACADEMIC_SOLVER_INITIALIZED__ = true;

  let isUIVisible = true;
  let isSolving = false;
  let currentAnswerText = '';

  let appearance = {
    enable_prompt_input: true,
    answer_text_color: '#FFFFFF',
    answer_font_size: 13,
    button_bg_color: '#000000',
    button_size: 30,
    prompt_bg_color: '#1A1A1A',
    prompt_width: 180
  };

  let host = document.getElementById('academic-solver-root');
  let shadow = null;
  let bottomControlsBar = null;
  let promptInput = null;
  let captureButton = null;
  let answerContainer = null;
  let answerText = null;
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
      const btnColor = appearance.button_bg_color || '#000000';
      const btnSize = parseInt(appearance.button_size, 10) || 30;
      const contrast = getContrastColor(btnColor);

      captureButton.style.setProperty('background-color', btnColor, 'important');
      captureButton.style.setProperty('width', `${btnSize}px`, 'important');
      captureButton.style.setProperty('height', `${btnSize}px`, 'important');
      captureButton.style.setProperty('border-color', contrast === '#000000' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.25)', 'important');

      const svg = captureButton.querySelector('svg');
      if (svg) {
        const iconSize = Math.max(12, Math.round(btnSize * 0.46));
        svg.setAttribute('width', iconSize);
        svg.setAttribute('height', iconSize);
        svg.style.setProperty('stroke', contrast, 'important');
      }
    }

    if (promptInput) {
      const isEnabled = appearance.enable_prompt_input !== false;
      promptInput.style.display = isEnabled ? 'block' : 'none';

      const pColor = appearance.prompt_bg_color || '#1A1A1A';
      const pWidth = parseInt(appearance.prompt_width, 10) || 180;
      const pContrast = getContrastColor(pColor);

      promptInput.style.setProperty('background-color', pColor, 'important');
      promptInput.style.setProperty('color', pContrast, 'important');
      promptInput.style.setProperty('width', `${pWidth}px`, 'important');
      promptInput.style.setProperty('border-color', pContrast === '#000000' ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)', 'important');
    }
  }

  function loadStoredSettings() {
    if (!isRuntimeValid() || !chrome.storage || !chrome.storage.local) return;
    try {
      chrome.storage.local.get([
        'enable_prompt_input',
        'answer_text_color', 'answer_font_size',
        'button_bg_color', 'button_size',
        'prompt_bg_color', 'prompt_width'
      ], (data) => {
        if (chrome.runtime.lastError) return;
        applyAppearanceSettings(data);
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
        bottom: 0px !important;
        right: 0px !important;
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        z-index: 2147483647 !important;
        padding: 4px 6px !important;
        box-sizing: border-box !important;
        max-width: 90vw !important;
        pointer-events: auto !important;
      }

      #prompt-input {
        background-color: #1a1a1a !important;
        color: #ffffff !important;
        border: 1px solid rgba(255, 255, 255, 0.2) !important;
        border-radius: 14px !important;
        padding: 4px 10px !important;
        font-size: 11px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        outline: none !important;
        width: 180px !important;
        max-width: 60vw !important;
        box-sizing: border-box !important;
        pointer-events: auto !important;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3) !important;
        transition: border-color 0.15s ease, box-shadow 0.15s ease, width 0.15s ease !important;
      }

      #prompt-input:focus {
        border-color: #58a6ff !important;
        box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.3) !important;
      }

      #prompt-input::placeholder {
        color: rgba(255, 255, 255, 0.45) !important;
        font-style: italic !important;
      }

      #capture-button {
        position: relative !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 30px !important;
        height: 30px !important;
        border-radius: 50% !important;
        background-color: #000000 !important;
        border: 1px solid rgba(255, 255, 255, 0.25) !important;
        box-shadow: none !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 2147483647 !important;
        outline: none !important;
        pointer-events: auto !important;
        flex-shrink: 0 !important;
        transition: background-color 0.1s ease, transform 0.1s ease, opacity 0.1s ease !important;
        -webkit-tap-highlight-color: transparent;
      }

      #capture-button:hover {
        opacity: 0.88 !important;
      }

      #capture-button:active {
        transform: scale(0.92) !important;
      }

      #capture-button svg {
        stroke: #ffffff !important;
        transition: stroke 0.1s ease !important;
        display: block !important;
        pointer-events: none !important;
      }

      #capture-button.flash-confirm {
        filter: invert(1) !important;
      }

      #answer-display-container {
        position: fixed !important;
        bottom: 45px !important;
        left: 0px !important;
        width: 100vw !important;
        max-height: 25vh !important;
        min-height: 22px !important;
        background: transparent !important;
        pointer-events: none !important;
        z-index: 2147483645 !important;
        display: flex !important;
        align-items: flex-end !important;
        justify-content: center !important;
        padding: 4px 30px 2px 25px !important;
        box-sizing: border-box !important;
        text-align: center !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
      }

      #answer-text {
        color: #ffffff !important;
        font-weight: 400 !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        font-size: 13px !important;
        line-height: 1.5 !important;
        text-shadow: none !important;
        user-select: none !important;
        white-space: pre-wrap !important;
        word-break: break-word !important;
        overflow-wrap: break-word !important;
        overflow-y: auto !important;
        scrollbar-width: none !important;
        max-width: 100% !important;
        width: 100% !important;
      }

      #answer-text::-webkit-scrollbar {
        display: none !important;
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
    uiWrapper.appendChild(bottomControlsBar);
    uiWrapper.appendChild(answerContainer);

    shadow.appendChild(style);
    shadow.appendChild(hiddenToggleZone);
    shadow.appendChild(uiWrapper);

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
          }

          if (answerText) {
            answerText.textContent = formatAnswerForBar(currentAnswerText);
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
