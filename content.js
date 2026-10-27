/**
 * SABIS KILLER - Content Script (v2.0)
 * Minimalist academic assistant overlay with Liquid Glass refraction,
 * zero-box floating answer typography, and positionable UI elements.
 * Settings and AI configuration are managed via the native popup launcher.
 */

(function () {
  'use strict';

  // State
  let isUIVisible = true;
  let isSolving = false;
  let currentAnswerText = '';

  // Elements
  let host = null;
  let shadow = null;
  let hiddenToggleZone = null;
  let uiWrapper = null;
  let bottomControlsBar = null;
  let promptInput = null;
  let captureButton = null;
  let answerContainer = null;
  let answerText = null;
  let modelBadge = null;

  // Active position picker target
  let activePickerTarget = null;

  // Positions for movable elements (null = default CSS layout)
  const positions = {
    button: null,
    prompt: null,
    answer: null
  };

  // Appearance defaults
  let appearance = {
    enable_prompt_input: true,
    answer_text_color: '#FFFFFF',
    answer_font_size: 14,
    button_bg_color: '#FFFFFF',
    button_size: 30,
    prompt_bg_color: '#FFFFFF',
    prompt_width: 180,
    glass_refraction: 70
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
        'glass_refraction',
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

  function startPositionPicker(targetElement, onComplete) {
    activePickerTarget = targetElement;

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
          if (typeof onComplete === 'function') onComplete({ x: posX, y: posY });
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
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!msg) return;

        const target = msg.targetElement || msg.target;
        if ((msg.action === 'START_POSITION_PICKER' || msg.action === 'ACTIVATE_POSITION_PICKER') && target) {
          startPositionPicker(target);
          sendResponse({ success: true });
          return;
        }
        if (msg.action === 'RESET_POSITION' && target) {
          positions[target] = null;
          try {
            chrome.storage.local.remove([target + '_position', 'pos_' + target]);
          } catch (_) {}
          resetTargetPosition(target);
          sendResponse({ success: true });
          return;
        }
        if (msg.action === 'UPDATE_SETTINGS' && msg.settings) {
          applyAppearanceSettings(msg.settings);
          sendResponse({ success: true });
          return;
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
        ['button', 'prompt', 'answer'].forEach(target => {
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
