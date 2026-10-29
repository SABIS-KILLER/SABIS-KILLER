/**
 * SABIS KILLER - Content Script (v2.1)
 * In-Page Apple iOS 27 Liquid Glass Centered Modal,
 * Heuristic AI pre-processor, zero-shadow pure black floating answer overlay,
 * and input auto-fill anti-hijacking system.
 */

(function () {
  'use strict';

  // State
  let isUIVisible = true;
  let isStudyMode = false;
  let isSolving = false;
  let currentAnswerText = '';
  let isModalOpen = false;
  let currentActiveProvider = 'gemini';
  let modalSaveToastTimer = null;
  let modalSaveDebounceTimer = null;
  let studyBubbleContainer = null;
  let studyLoadingPill = null;
  let currentStudyLayoutData = null;
  let studyThreadHistory = [];
  let currentTargetQuestionEl = null;
  if (typeof window !== 'undefined') {
    window.currentTargetQuestionEl = null;
  }

  // Immediate early read of persistent UI visibility state on page refresh/navigation
  // NOTE: isRuntimeValid() is defined later; inline the check here to avoid TDZ error
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local) {
    try {
      chrome.storage.local.get(['is_ui_visible', 'ui_visible', 'studyMode'], (res) => {
        if (!chrome.runtime.lastError && res) {
          if (res.is_ui_visible !== undefined) {
            isUIVisible = !!res.is_ui_visible;
          } else if (res.ui_visible !== undefined) {
            isUIVisible = !!res.ui_visible;
          }
          if (res.studyMode !== undefined) {
            isStudyMode = !!res.studyMode;
          }
          if (uiWrapper) {
            uiWrapper.style.display = isUIVisible ? 'block' : 'none';
          }
        }
      });
    } catch (_) {}
  }

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

  // In-Page Center Modal Elements
  let settingsModalBackdrop = null;
  let settingsModalDialog = null;
  let modalSaveToast = null;

  // Repositioning State
  let isRepositioning = false;
  let activePickerTarget = null;

  // Positions for movable elements (null = default layout)
  const positions = {
    button: null,
    prompt: null,
    answer: null,
    panel: null
  };

  // Appearance defaults (Answer text strictly defaults to pure black with zero shadow)
  let appearance = {
    enable_prompt_input: true,
    answer_text_color: '#000000',
    answer_font_size: 14,
    button_bg_color: '#FFFFFF',
    button_size: 30,
    prompt_bg_color: '#FFFFFF',
    prompt_width: 180,
    glass_refraction: 70
  };

  const PROVIDERS = {
    gemini: {
      name: 'Google AI Studio',
      keyInputId: 'inpage-apiKey-gemini',
      modelSelectId: 'inpage-models-gemini',
      cardId: 'inpage-card-gemini',
      tabBtnId: 'inpage-tab-gemini',
      tabDotId: 'inpage-dot-gemini',
      storageKey: 'GEMINI_API_KEY',
      altKey: 'geminiApiKey',
      modelKey: 'gemini_model',
      altModelKey: 'geminiModel',
      defaultModel: 'auto_dynamic',
      getTestConfig: (key, model) => {
        const testModel = (model === 'auto_dynamic' || model?.startsWith('auto')) ? 'gemini-3.8-flash' : (model || 'gemini-3.8-flash');
        return {
          url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(testModel)}:generateContent?key=${encodeURIComponent(key)}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Respond with OK' }] }] })
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

  // ── 6. Heuristic Task Classifier (<1ms Client-Side Edge Pre-Processing) ─────
  function isComplexTask(prompt) {
    if (!prompt || typeof prompt !== 'string') return false;
    const text = prompt.trim();
    const lower = text.toLowerCase();

    // High Context / Length: Prompts exceeding 400 characters OR containing multi-step keywords
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

  // ── 1 & 5. Fixed Glass Transparency Slider (0% to 100% Linear Scaling) ────
  function applyGlassRefraction(value) {
    if (!host) return;
    const val = Math.max(0, Math.min(100, parseInt(value, 10) || 0));
    const t = val / 100;

    // 0%: 100% solid, opaque color, zero blur, zero glass sheen
    // 100%: Ghost transparent (0.03), 40px blur, full specular refraction
    const glassOpacity = (1.0 - 0.97 * t).toFixed(3);
    const cardOpacity = (1.0 - 0.96 * t).toFixed(3);
    const inputOpacity = (1.0 - 0.92 * t).toFixed(3);
    const glassBlur = `${Math.round(t * 40)}px`;
    const glassSaturate = `${Math.round(100 + t * 120)}%`;
    const glassRefraction = t.toFixed(3);
    const borderAlpha = (0.15 + 0.55 * t).toFixed(3);
    const insetAlpha = (0.85 * t).toFixed(3);
    const shadowAlpha = (0.08 + 0.16 * t).toFixed(3);

    host.style.setProperty('--glass-opacity', glassOpacity);
    host.style.setProperty('--glass-card-opacity', cardOpacity);
    host.style.setProperty('--glass-input-opacity', inputOpacity);
    host.style.setProperty('--glass-blur', glassBlur);
    host.style.setProperty('--glass-saturate', glassSaturate);
    host.style.setProperty('--glass-refraction', glassRefraction);
    host.style.setProperty('--glass-border-alpha', borderAlpha);
    host.style.setProperty('--glass-inset-alpha', insetAlpha);
    host.style.setProperty('--glass-shadow-alpha', shadowAlpha);
  }

  // ── 3. Answer Text & Appearance Styling (Plain Black Text, Zero Shadow) ───
  function applyAppearanceSettings(newSettings) {
    if (!newSettings) return;
    appearance = { ...appearance, ...newSettings };

    const glassVal = appearance.glass_refraction != null ? parseInt(appearance.glass_refraction, 10) : 70;
    applyGlassRefraction(glassVal);

    const _gt = Math.max(0, Math.min(100, glassVal)) / 100;
    const _gBgOp = parseFloat((1.0 - 0.97 * _gt).toFixed(3));
    const _gBlur = Math.round(_gt * 40);
    const _gSat = Math.round(100 + _gt * 120);
    const _gBorder = parseFloat((0.15 + 0.55 * _gt).toFixed(3));
    const _gInset = parseFloat((0.85 * _gt).toFixed(3));
    const _gShadow = parseFloat((0.08 + 0.16 * _gt).toFixed(3));

    if (answerContainer) {
      answerContainer.style.setProperty('background', 'transparent', 'important');
      answerContainer.style.setProperty('backdrop-filter', 'none', 'important');
      answerContainer.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
      answerContainer.style.setProperty('border', 'none', 'important');
      answerContainer.style.setProperty('box-shadow', 'none', 'important');
      answerContainer.style.setProperty('padding', '0', 'important');
    }

    if (answerText) {
      const textColor = appearance.answer_text_color || '#000000';
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
      answerText.style.setProperty('text-shadow', 'none', 'important');
      answerText.style.setProperty('filter', 'none', 'important');
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
      captureButton.style.setProperty('box-shadow', `inset 0 1.5px 1px rgba(255, 255, 255, ${_gInset}), inset 0 -1px 1px rgba(0, 0, 0, 0.15), 0 8px 24px rgba(0, 0, 0, ${_gShadow})`, 'important');
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
      promptInput.style.setProperty('box-shadow', `inset 0 1px 1px rgba(255, 255, 255, ${_gInset}), 0 8px 24px rgba(0, 0, 0, ${_gShadow})`, 'important');
      promptInput.style.setProperty('color', pContrast, 'important');
      promptInput.style.setProperty('width', `${pWidth}px`, 'important');
    }
  }

  function getTargetElement(targetKey) {
    if (targetKey === 'button') return captureButton;
    if (targetKey === 'prompt') return promptInput;
    if (targetKey === 'answer' || targetKey === 'panel') return answerContainer;
    return answerContainer || captureButton;
  }

  function applyTargetPosition(target, x, y) {
    if (x == null || y == null) return;
    const posX = Math.round(x);
    const posY = Math.round(y);

    if (target === 'button' && captureButton) {
      captureButton.style.setProperty('position', 'fixed', 'important');
      captureButton.style.setProperty('top', `${posY}px`, 'important');
      captureButton.style.setProperty('left', `${posX}px`, 'important');
      captureButton.style.setProperty('bottom', 'auto', 'important');
      captureButton.style.setProperty('right', 'auto', 'important');
      captureButton.style.setProperty('z-index', '2147483647', 'important');
    } else if (target === 'prompt' && promptInput) {
      promptInput.style.setProperty('position', 'fixed', 'important');
      promptInput.style.setProperty('top', `${posY}px`, 'important');
      promptInput.style.setProperty('left', `${posX}px`, 'important');
      promptInput.style.setProperty('bottom', 'auto', 'important');
      promptInput.style.setProperty('right', 'auto', 'important');
      promptInput.style.setProperty('z-index', '2147483647', 'important');
    } else if ((target === 'answer' || target === 'panel') && answerContainer) {
      answerContainer.style.setProperty('position', 'fixed', 'important');
      answerContainer.style.setProperty('top', `${posY}px`, 'important');
      answerContainer.style.setProperty('left', `${posX}px`, 'important');
      answerContainer.style.setProperty('bottom', 'auto', 'important');
      answerContainer.style.setProperty('right', 'auto', 'important');
      answerContainer.style.setProperty('width', 'auto', 'important');
      answerContainer.style.setProperty('max-width', 'min(90vw, 650px)', 'important');
      answerContainer.style.setProperty('white-space', 'pre-wrap', 'important');
      answerContainer.style.setProperty('word-break', 'break-word', 'important');
      answerContainer.style.setProperty('overflow-wrap', 'break-word', 'important');
      answerContainer.style.setProperty('margin-bottom', '8px', 'important');
      answerContainer.style.setProperty('padding-bottom', '4px', 'important');
      answerContainer.style.setProperty('background', 'transparent', 'important');
      answerContainer.style.setProperty('backdrop-filter', 'none', 'important');
      answerContainer.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
      answerContainer.style.setProperty('border', 'none', 'important');
      answerContainer.style.setProperty('box-shadow', 'none', 'important');
      answerContainer.style.setProperty('z-index', '2147483645', 'important');
      updateAnswerBoundaryShift();
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
    } else if ((target === 'answer' || target === 'panel') && answerContainer) {
      answerContainer.style.removeProperty('top');
      answerContainer.style.removeProperty('right');
      answerContainer.style.removeProperty('transform');
      answerContainer.style.setProperty('position', 'fixed', 'important');
      answerContainer.style.setProperty('bottom', '8px', 'important');
      answerContainer.style.setProperty('left', '8px', 'important');
      answerContainer.style.setProperty('width', 'auto', 'important');
      answerContainer.style.setProperty('max-width', 'min(90vw, 650px)', 'important');
      answerContainer.style.setProperty('white-space', 'pre-wrap', 'important');
      answerContainer.style.setProperty('word-break', 'break-word', 'important');
      answerContainer.style.setProperty('overflow-wrap', 'break-word', 'important');
      answerContainer.style.setProperty('margin-bottom', '8px', 'important');
      answerContainer.style.setProperty('padding-bottom', '4px', 'important');
      answerContainer.style.setProperty('background', 'transparent', 'important');
      answerContainer.style.setProperty('backdrop-filter', 'none', 'important');
      answerContainer.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
      answerContainer.style.setProperty('border', 'none', 'important');
      answerContainer.style.setProperty('box-shadow', 'none', 'important');
      answerContainer.style.setProperty('z-index', '2147483645', 'important');
      updateAnswerBoundaryShift();
    }
  }

  function updateAnswerBoundaryShift() {
    if (!answerContainer || isRepositioning) return;

    // Reset transform to measure unshifted layout bounds
    answerContainer.style.transform = 'none';

    const rect = answerContainer.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const viewportHeight = window.innerHeight;
    const bottomMargin = 12;
    let overflow = 0;

    // Check viewport bottom overflow
    const overflowViewport = rect.bottom - (viewportHeight - bottomMargin);
    if (overflowViewport > 0) {
      overflow = Math.max(overflow, overflowViewport);
    }

    // Check collision with bottom controls bar if both are active and visible
    if (bottomControlsBar && isUIVisible && bottomControlsBar.style.display !== 'none') {
      const barRect = bottomControlsBar.getBoundingClientRect();
      if (barRect.width > 0 && barRect.height > 0) {
        // Horizontal overlap test
        const xOverlap = !(rect.right < barRect.left || rect.left > barRect.right);
        if (xOverlap) {
          // If answer overlaps vertically with the bar
          const overlapBar = rect.bottom - (barRect.top - 8);
          if (overlapBar > 0 && rect.top < barRect.bottom) {
            overflow = Math.max(overflow, overlapBar);
          }
        }
      }
    }

    if (overflow > 0) {
      const shift = Math.ceil(overflow);
      answerContainer.style.transform = `translateY(-${shift}px)`;
    } else {
      answerContainer.style.transform = 'none';
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
    updateAnswerBoundaryShift();
  }

  function loadStoredSettings() {
    if (!isRuntimeValid() || !chrome.storage || !chrome.storage.local) return;
    try {
      chrome.storage.local.get([
        'enable_prompt_input', 'studyMode',
        'is_ui_visible', 'ui_visible',
        'answer_text_color', 'answer_font_size',
        'button_bg_color', 'button_size',
        'prompt_bg_color', 'prompt_width',
        'glass_refraction',
        'button_position', 'pos_button',
        'prompt_position', 'pos_prompt',
        'answer_position', 'pos_answer',
        'panelPosition', 'panel_position'
      ], (data) => {
        if (chrome.runtime.lastError || !data) return;
        if (data.is_ui_visible !== undefined) {
          isUIVisible = !!data.is_ui_visible;
        } else if (data.ui_visible !== undefined) {
          isUIVisible = !!data.ui_visible;
        }
        if (data.studyMode !== undefined) {
          isStudyMode = !!data.studyMode;
        }
        const modalStudyToggle = shadow ? shadow.getElementById('inpage-enable-study-mode') : null;
        if (modalStudyToggle) {
          modalStudyToggle.checked = isStudyMode;
        }
        if (uiWrapper) {
          uiWrapper.style.display = isUIVisible ? 'block' : 'none';
        }
        applyAppearanceSettings(data);
        const btnPos = data.button_position || data.pos_button;
        const pPos = data.prompt_position || data.pos_prompt;
        const ansPos = data.answer_position || data.pos_answer || data.panelPosition || data.panel_position;
        if (btnPos) {
          const x = btnPos.left ?? btnPos.x;
          const y = btnPos.top ?? btnPos.y;
          if (x != null && y != null) positions.button = { x, y, top: y, left: x };
        }
        if (pPos) {
          const x = pPos.left ?? pPos.x;
          const y = pPos.top ?? pPos.y;
          if (x != null && y != null) positions.prompt = { x, y, top: y, left: x };
        }
        if (ansPos) {
          const x = ansPos.left ?? ansPos.x;
          const y = ansPos.top ?? ansPos.y;
          if (x != null && y != null) {
            positions.answer = { x, y, top: y, left: x };
            positions.panel = { x, y, top: y, left: x };
          }
        }
        applyPositions();
      });
    } catch (_) {}
  }

  // ── Position Picker & Drag-and-Drop Repositioning ───────────────────────────
  function startPositionPicker(targetKey, onComplete) {
    targetKey = (targetKey === 'panel') ? 'answer' : (targetKey || 'answer');
    activePickerTarget = targetKey;
    isRepositioning = true;

    const el = getTargetElement(targetKey);
    if (!el) {
      isRepositioning = false;
      return;
    }

    if (targetKey === 'answer' || targetKey === 'panel') {
      el.style.transform = 'none';
    }

    const wasModalOpenBeforePicker = isModalOpen;
    if (wasModalOpenBeforePicker) {
      closeSettingsModal();
    }

    // Ensure UI is visible
    if (!isUIVisible) {
      isUIVisible = true;
      if (uiWrapper) uiWrapper.style.display = 'block';
      try {
        chrome.storage.local.set({ is_ui_visible: true, ui_visible: true });
      } catch (_) {}
    }

    // If answer container has no text, provide temporary preview so it can be seen and dragged
    let didSetTempAnswer = false;
    if ((targetKey === 'answer' || targetKey === 'panel') && answerText && !answerText.textContent.trim()) {
      answerText.textContent = 'Answer Overlay Preview';
      didSetTempAnswer = true;
    }

    // Clean up any stale picker elements
    const oldOverlay = document.getElementById('position-picker-overlay');
    if (oldOverlay) oldOverlay.remove();
    const oldHint = document.getElementById('position-picker-hint');
    if (oldHint) oldHint.remove();

    // Fullscreen backdrop overlay for click-to-anchor
    const overlay = document.createElement('div');
    overlay.id = 'position-picker-overlay';

    // Tooltip instruction pill
    const hint = document.createElement('div');
    hint.id = 'position-picker-hint';
    const friendlyName = targetKey === 'button' ? 'Solver Button' : (targetKey === 'prompt' ? 'Prompt Bar' : 'Answer Panel');
    hint.textContent = `Repositioning ${friendlyName} — Drag directly or click anywhere to anchor (Esc to cancel)`;

    const targetDoc = document.body || document.documentElement;
    if (targetDoc) {
      targetDoc.appendChild(overlay);
      targetDoc.appendChild(hint);
    }

    // Mark target element active
    el.classList.add('repositioning-active-target');
    el.style.setProperty('pointer-events', 'auto', 'important');
    el.style.setProperty('z-index', '2147483647', 'important');

    let isDragging = false;
    let dragStartPointerX = 0;
    let dragStartPointerY = 0;
    let dragStartElX = 0;
    let dragStartElY = 0;
    let hasMoved = false;

    const initialRect = el.getBoundingClientRect();
    let currentPosX = initialRect.left;
    let currentPosY = initialRect.top;

    function onElementMouseDown(e) {
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      hasMoved = false;
      dragStartPointerX = e.clientX;
      dragStartPointerY = e.clientY;

      const rect = el.getBoundingClientRect();
      dragStartElX = rect.left;
      dragStartElY = rect.top;

      el.classList.add('is-dragging');

      window.addEventListener('mousemove', onWindowMouseMove, { capture: true });
      window.addEventListener('mouseup', onWindowMouseUp, { capture: true, once: true });
    }

    function onWindowMouseMove(e) {
      if (!isDragging) return;
      const dx = e.clientX - dragStartPointerX;
      const dy = e.clientY - dragStartPointerY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        hasMoved = true;
      }

      const rect = el.getBoundingClientRect();
      const maxX = Math.max(0, window.innerWidth - (rect.width || 40));
      const maxY = Math.max(0, window.innerHeight - (rect.height || 40));

      currentPosX = Math.max(4, Math.min(maxX - 4, dragStartElX + dx));
      currentPosY = Math.max(4, Math.min(maxY - 4, dragStartElY + dy));

      applyTargetPosition(targetKey, currentPosX, currentPosY);
    }

    function onWindowMouseUp(e) {
      isDragging = false;
      el.classList.remove('is-dragging');
      window.removeEventListener('mousemove', onWindowMouseMove, { capture: true });

      if (hasMoved) {
        finishPositioning(currentPosX, currentPosY);
      }
    }

    function onOverlayClick(e) {
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const targetW = rect.width || 80;
      const targetH = rect.height || 36;
      const newX = Math.max(8, Math.min(window.innerWidth - targetW - 8, e.clientX - targetW / 2));
      const newY = Math.max(8, Math.min(window.innerHeight - targetH - 8, e.clientY - targetH / 2));

      finishPositioning(newX, newY);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
        if (positions[targetKey]) {
          applyTargetPosition(targetKey, positions[targetKey].x, positions[targetKey].y);
        } else {
          resetTargetPosition(targetKey);
        }
        if (wasModalOpenBeforePicker) openSettingsModal();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        finishPositioning(currentPosX, currentPosY);
      }
    }

    function cleanup() {
      isRepositioning = false;
      el.classList.remove('repositioning-active-target');
      el.classList.remove('is-dragging');
      el.removeEventListener('mousedown', onElementMouseDown, { capture: true });
      overlay.removeEventListener('click', onOverlayClick, { capture: true });
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('mousemove', onWindowMouseMove, { capture: true });

      const o = document.getElementById('position-picker-overlay');
      if (o) o.remove();
      const h = document.getElementById('position-picker-hint');
      if (h) h.remove();

      if (didSetTempAnswer && answerText && answerText.textContent === 'Answer Overlay Preview') {
        answerText.textContent = '';
      }
      updateAnswerBoundaryShift();
    }

    function finishPositioning(finalX, finalY) {
      cleanup();

      finalX = Math.round(finalX);
      finalY = Math.round(finalY);

      positions[targetKey] = { x: finalX, y: finalY, top: finalY, left: finalX };
      applyTargetPosition(targetKey, finalX, finalY);

      try {
        const payload = {
          [`${targetKey}_position`]: { x: finalX, y: finalY, top: finalY, left: finalX },
          [`pos_${targetKey}`]: { x: finalX, y: finalY, top: finalY, left: finalX }
        };
        if (targetKey === 'answer' || targetKey === 'panel') {
          payload.panelPosition = { top: finalY, left: finalX, x: finalX, y: finalY };
          payload.panel_position = { top: finalY, left: finalX, x: finalX, y: finalY };
        }
        chrome.storage.local.set(payload, () => {
          if (typeof onComplete === 'function') onComplete({ x: finalX, y: finalY, top: finalY, left: finalX });
          if (wasModalOpenBeforePicker) {
            setTimeout(() => {
              openSettingsModal();
              showModalToast('Position Saved');
            }, 120);
          }
        });
      } catch (_) {
        if (wasModalOpenBeforePicker) openSettingsModal();
      }
    }

    el.addEventListener('mousedown', onElementMouseDown, { capture: true });
    overlay.addEventListener('click', onOverlayClick, { capture: true });
    window.addEventListener('keydown', onKeyDown, { capture: true });
  }

  // ── 1. Custom In-Page Center Modal Functions ────────────────────────────────
  function showModalToast(msg = 'Saved') {
    if (!modalSaveToast) return;
    const span = modalSaveToast.querySelector('span');
    if (span) span.textContent = msg;
    modalSaveToast.classList.add('show');
    clearTimeout(modalSaveToastTimer);
    modalSaveToastTimer = setTimeout(() => {
      modalSaveToast.classList.remove('show');
    }, 1800);
  }

  function updateModalProviderStatus() {
    if (!shadow) return;
    const statusBadge = shadow.getElementById('inpage-status-badge');
    const statusText = shadow.getElementById('inpage-status-text');
    if (!statusBadge || !statusText) return;

    const conf = PROVIDERS[currentActiveProvider];
    if (!conf) return;

    const keyInput = shadow.getElementById(conf.keyInputId);
    const hasKey = keyInput && keyInput.value.trim().length > 0;

    if (hasKey) {
      statusBadge.className = 'modal-status-badge status-ready';
      statusText.textContent = 'Ready';
    } else {
      statusBadge.className = 'modal-status-badge status-missing';
      statusText.textContent = 'No Key';
    }

    // Update dots
    Object.keys(PROVIDERS).forEach(k => {
      const pConf = PROVIDERS[k];
      const pInput = shadow.getElementById(pConf.keyInputId);
      const dot = shadow.getElementById(pConf.tabDotId);
      if (dot && pInput) {
        dot.classList.toggle('configured', pInput.value.trim().length > 0);
      }
    });
  }

  function switchModalProvider(providerKey) {
    if (!PROVIDERS[providerKey] || !shadow) return;
    currentActiveProvider = providerKey;
    closeAllModalCustomSelects();

    shadow.querySelectorAll('.modal-segmented-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-provider') === providerKey);
    });

    shadow.querySelectorAll('.modal-provider-card').forEach(card => {
      card.classList.toggle('active', card.id === PROVIDERS[providerKey].cardId);
    });

    updateModalProviderStatus();
    autoSaveModal(false);
  }

  function openSettingsModal() {
    if (!settingsModalDialog || !settingsModalBackdrop) return;
    populateModalFields();
    settingsModalBackdrop.style.removeProperty('display');
    settingsModalBackdrop.style.removeProperty('opacity');
    settingsModalBackdrop.style.removeProperty('visibility');
    settingsModalBackdrop.style.removeProperty('pointer-events');

    settingsModalDialog.style.removeProperty('display');
    settingsModalDialog.style.removeProperty('opacity');
    settingsModalDialog.style.removeProperty('visibility');
    settingsModalDialog.style.removeProperty('pointer-events');

    // Guarantee settings modal always appears above the study bubble overlay
    settingsModalBackdrop.style.setProperty('z-index', '10005', 'important');
    settingsModalDialog.style.setProperty('z-index', '10005', 'important');

    settingsModalBackdrop.classList.add('open');
    settingsModalDialog.classList.add('open');
    isModalOpen = true;
  }

  function closeSettingsModal() {
    if (!settingsModalDialog || !settingsModalBackdrop) return;
    closeAllModalCustomSelects();
    settingsModalDialog.classList.remove('open');
    settingsModalBackdrop.classList.remove('open');

    settingsModalBackdrop.style.setProperty('display', 'none', 'important');
    settingsModalBackdrop.style.setProperty('opacity', '0', 'important');
    settingsModalBackdrop.style.setProperty('visibility', 'hidden', 'important');
    settingsModalBackdrop.style.setProperty('pointer-events', 'none', 'important');

    settingsModalDialog.style.setProperty('display', 'none', 'important');
    settingsModalDialog.style.setProperty('opacity', '0', 'important');
    settingsModalDialog.style.setProperty('visibility', 'hidden', 'important');
    settingsModalDialog.style.setProperty('pointer-events', 'none', 'important');

    isModalOpen = false;
  }

  // ── Custom Liquid Glass Dropdown Helpers (Shadow DOM) ──
  function initModalCustomSelects() {
    if (!shadow) return;
    const backdrop = shadow.getElementById('modal-dropdown-backdrop');
    const wrappers = shadow.querySelectorAll('.modal-custom-select-wrapper');
    wrappers.forEach(wrapper => {
      const trigger = wrapper.querySelector('.modal-custom-select-trigger');
      const panel = wrapper.querySelector('.modal-custom-options-panel');
      const hiddenInput = wrapper.querySelector('input[type="hidden"]');
      const options = wrapper.querySelectorAll('.modal-custom-option');
      const label = wrapper.querySelector('.modal-custom-select-label');

      if (!trigger || !panel || !hiddenInput) return;

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = wrapper.classList.contains('open');
        closeAllModalCustomSelects();
        if (!isOpen) {
          wrapper.classList.add('open');
          wrapper.closest('.modal-provider-card')?.classList.add('has-open-select');
          trigger.setAttribute('aria-expanded', 'true');
          if (backdrop) backdrop.classList.add('active');
        }
      });

      options.forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = opt.getAttribute('data-value');
          const optText = opt.querySelector('.modal-custom-option-text')?.textContent || val;
          hiddenInput.value = val;
          if (label) label.textContent = optText;

          options.forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');

          wrapper.classList.remove('open');
          wrapper.closest('.modal-provider-card')?.classList.remove('has-open-select');
          trigger.setAttribute('aria-expanded', 'false');
          if (backdrop) backdrop.classList.remove('active');

          hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
          autoSaveModal();
        });
      });
    });

    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllModalCustomSelects();
      });
    }

    shadow.addEventListener('click', (e) => {
      const path = e.composedPath ? e.composedPath() : [];
      const insideWrapper = path.some(el => el.classList && el.classList.contains('modal-custom-select-wrapper'));
      if (!insideWrapper) {
        closeAllModalCustomSelects();
      }
    });
  }

  function closeAllModalCustomSelects() {
    if (!shadow) return;
    const backdrop = shadow.getElementById('modal-dropdown-backdrop');
    if (backdrop) backdrop.classList.remove('active');
    shadow.querySelectorAll('.modal-provider-card.has-open-select').forEach(c => c.classList.remove('has-open-select'));
    shadow.querySelectorAll('.modal-custom-select-wrapper.open').forEach(w => {
      w.classList.remove('open');
      const trigger = w.querySelector('.modal-custom-select-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  function setModalCustomSelectValue(selectId, value) {
    if (!shadow) return;
    const input = shadow.getElementById(selectId);
    if (!input) return;
    input.value = value;
    const wrapper = input.closest('.modal-custom-select-wrapper');
    if (!wrapper) return;
    const label = wrapper.querySelector('.modal-custom-select-label');
    const options = wrapper.querySelectorAll('.modal-custom-option');
    let matched = false;
    options.forEach(opt => {
      if (opt.getAttribute('data-value') === value) {
        opt.classList.add('selected');
        if (label) label.textContent = opt.querySelector('.modal-custom-option-text')?.textContent || value;
        matched = true;
      } else {
        opt.classList.remove('selected');
      }
    });
    if (!matched && options.length > 0) {
      options[0].classList.add('selected');
      input.value = options[0].getAttribute('data-value');
      if (label) label.textContent = options[0].querySelector('.modal-custom-option-text')?.textContent || input.value;
    }
  }

  function toggleSettingsModal() {
    if (isModalOpen) {
      closeSettingsModal();
    } else {
      openSettingsModal();
    }
  }

  function populateModalFields() {
    if (!shadow) return;
    chrome.storage.local.get([
      'ai_provider', 'active_provider',
      'glass_refraction', 'enable_prompt_input',
      'answer_text_color', 'answer_font_size',
      'button_bg_color', 'button_size',
      'prompt_bg_color', 'prompt_width',
      'GEMINI_API_KEY', 'geminiApiKey', 'gemini_model', 'geminiModel'
    ], (items) => {
      if (chrome.runtime.lastError || !items) return;

      currentActiveProvider = 'gemini';

      Object.keys(PROVIDERS).forEach(prov => {
        const conf = PROVIDERS[prov];
        const keyInput = shadow.getElementById(conf.keyInputId);
        const modelSelect = shadow.getElementById(conf.modelSelectId);

        const valKey = items[conf.storageKey] || (conf.altKey && items[conf.altKey]) || '';
        let valModel = items[conf.modelKey] || (conf.altModelKey && items[conf.altModelKey]) || conf.defaultModel;
        // Normalize any old auto option to auto_dynamic
        if (valModel?.startsWith('auto')) valModel = 'auto_dynamic';

        if (keyInput) keyInput.value = valKey;
        if (modelSelect) setModalCustomSelectValue(conf.modelSelectId, valModel);
      });

      const glassVal = items.glass_refraction != null ? items.glass_refraction : 70;
      const glassSlider = shadow.getElementById('inpage-glass-slider');
      const glassBadge = shadow.getElementById('inpage-glass-val');
      if (glassSlider) glassSlider.value = glassVal;
      if (glassBadge) glassBadge.textContent = `${glassVal}%`;
      applyGlassRefraction(glassVal);

      const promptToggle = shadow.getElementById('inpage-enable-prompt');
      if (promptToggle) promptToggle.checked = items.enable_prompt_input !== false;

      // Typography (Strictly pure black default)
      const ansColor = items.answer_text_color || '#000000';
      const ansSize = items.answer_font_size || 14;
      const ansPicker = shadow.getElementById('inpage-answer-color-picker');
      const ansHex = shadow.getElementById('inpage-answer-color-hex');
      const ansSlider = shadow.getElementById('inpage-answer-font-size');
      const ansBadge = shadow.getElementById('inpage-answer-font-size-val');
      if (ansPicker) ansPicker.value = ansColor;
      if (ansHex) ansHex.value = ansColor.toUpperCase();
      if (ansSlider) ansSlider.value = ansSize;
      if (ansBadge) ansBadge.textContent = `${ansSize}px`;

      // Button
      const btnColor = items.button_bg_color || '#FFFFFF';
      const btnSize = items.button_size || 30;
      const bPicker = shadow.getElementById('inpage-button-color-picker');
      const bHex = shadow.getElementById('inpage-button-color-hex');
      const bSlider = shadow.getElementById('inpage-button-size');
      const bBadge = shadow.getElementById('inpage-button-size-val');
      if (bPicker) bPicker.value = btnColor;
      if (bHex) bHex.value = btnColor.toUpperCase();
      if (bSlider) bSlider.value = btnSize;
      if (bBadge) bBadge.textContent = `${btnSize}px`;

      // Prompt Bar
      const pColor = items.prompt_bg_color || '#FFFFFF';
      const pWidth = items.prompt_width || 180;
      const pPicker = shadow.getElementById('inpage-prompt-color-picker');
      const pHex = shadow.getElementById('inpage-prompt-color-hex');
      const pSlider = shadow.getElementById('inpage-prompt-width');
      const pBadge = shadow.getElementById('inpage-prompt-width-val');
      if (pPicker) pPicker.value = pColor;
      if (pHex) pHex.value = pColor.toUpperCase();
      if (pSlider) pSlider.value = pWidth;
      if (pBadge) pBadge.textContent = `${pWidth}px`;

      switchModalProvider(currentActiveProvider);
    });
  }

  function autoSaveModal(showNotification = true) {
    if (!shadow) return;
    clearTimeout(modalSaveDebounceTimer);
    modalSaveDebounceTimer = setTimeout(() => {
      const data = {
        ai_provider: currentActiveProvider
      };

      Object.keys(PROVIDERS).forEach(prov => {
        const conf = PROVIDERS[prov];
        const keyEl = shadow.getElementById(conf.keyInputId);
        const modelEl = shadow.getElementById(conf.modelSelectId);

        const keyVal = keyEl ? keyEl.value.trim() : '';
        const modelVal = modelEl ? modelEl.value : conf.defaultModel;

        data[conf.storageKey] = keyVal;
        if (conf.altKey) data[conf.altKey] = keyVal;
        data[conf.modelKey] = modelVal;
        if (conf.altModelKey) data[conf.altModelKey] = modelVal;
      });

      const glassSlider = shadow.getElementById('inpage-glass-slider');
      const promptToggle = shadow.getElementById('inpage-enable-prompt');
      const studyToggle = shadow.getElementById('inpage-enable-study-mode');
      const ansHex = shadow.getElementById('inpage-answer-color-hex');
      const ansSlider = shadow.getElementById('inpage-answer-font-size');
      const bHex = shadow.getElementById('inpage-button-color-hex');
      const bSlider = shadow.getElementById('inpage-button-size');
      const pHex = shadow.getElementById('inpage-prompt-color-hex');
      const pSlider = shadow.getElementById('inpage-prompt-width');

      data.glass_refraction = glassSlider ? parseInt(glassSlider.value, 10) : 70;
      data.enable_prompt_input = promptToggle ? promptToggle.checked : true;
      data.studyMode = studyToggle ? studyToggle.checked : false;
      isStudyMode = data.studyMode;
      data.answer_text_color = ansHex ? ansHex.value.trim() : '#000000';
      data.answer_font_size = ansSlider ? parseInt(ansSlider.value, 10) : 14;
      data.button_bg_color = bHex ? bHex.value.trim() : '#FFFFFF';
      data.button_size = bSlider ? parseInt(bSlider.value, 10) : 30;
      data.prompt_bg_color = pHex ? pHex.value.trim() : '#FFFFFF';
      data.prompt_width = pSlider ? parseInt(pSlider.value, 10) : 180;

      chrome.storage.local.set(data, () => {
        applyAppearanceSettings(data);
        updateModalProviderStatus();
        if (showNotification) {
          showModalToast('Saved');
        }
      });
    }, 180);
  }

  // ── Listen for Messages from background.js ──────────────────────────────────
  if (isRuntimeValid()) {
    try {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!msg) return;

        if (msg.action === 'TOGGLE_SETTINGS_MODAL') {
          toggleSettingsModal();
          sendResponse({ success: true, isOpen: isModalOpen });
          return;
        }

        if (msg.action === 'OPEN_SETTINGS_MODAL') {
          openSettingsModal();
          sendResponse({ success: true });
          return;
        }

        if (msg.action === 'CLOSE_SETTINGS_MODAL') {
          closeSettingsModal();
          sendResponse({ success: true });
          return;
        }

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
          if (msg.settings.studyMode !== undefined) {
            isStudyMode = !!msg.settings.studyMode;
            const studyToggle = shadow ? shadow.getElementById('inpage-enable-study-mode') : null;
            if (studyToggle) studyToggle.checked = isStudyMode;
            if (!isStudyMode) {
              unmountStudyBubble();
              if (answerContainer) answerContainer.style.removeProperty('display');
            }
          }
          sendResponse({ success: true });
          return;
        }
      });
    } catch (_) {}
  }

  // ── Client-Side OCR & Browser Canvas Text Extractor ─────────────────────────
  function extractVerifiedTextFromDOMAndCanvas() {
    try {
      const parts = [];

      // 1. Page Title & URL
      if (document.title) {
        parts.push(`[Page Context]: ${document.title.trim()}`);
      }

      // Check visibility within active viewport
      const isVisibleInViewport = (el) => {
        if (!el || el.id === 'academic-solver-root' || el.closest('#academic-solver-root')) return false;
        const rect = el.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom >= 0 &&
          rect.top <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right >= 0 &&
          rect.left <= (window.innerWidth || document.documentElement.clientWidth)
        );
      };

      // 2. Extract Data Tables (Frequency tables, stem-and-leaf, matrices)
      const tables = document.querySelectorAll('table');
      tables.forEach((table, tIdx) => {
        if (!isVisibleInViewport(table)) return;
        const rows = [];
        table.querySelectorAll('tr').forEach(tr => {
          const cells = [];
          tr.querySelectorAll('th, td').forEach(cell => {
            const txt = cell.innerText.replace(/\s+/g, ' ').trim();
            if (txt) cells.push(txt);
          });
          if (cells.length > 0) {
            rows.push(cells.join(' | '));
          }
        });
        if (rows.length > 0) {
          parts.push(`[Data Table ${tIdx + 1}]:\n${rows.join('\n')}`);
        }
      });

      // 3. Extract Dropdown Selects & Options
      const selects = document.querySelectorAll('select');
      selects.forEach((sel, sIdx) => {
        if (!isVisibleInViewport(sel)) return;
        const opts = Array.from(sel.options).map(o => o.text.trim()).filter(Boolean);
        const selVal = sel.options[sel.selectedIndex]?.text?.trim() || '';
        parts.push(`[Dropdown ${sIdx + 1}]: Selected: "${selVal}", Options: [${opts.join(', ')}]`);
      });

      // 4. Extract Input Fields / Blanks
      const inputs = document.querySelectorAll('input[type="text"], input[type="number"], input:not([type]), textarea');
      inputs.forEach((inp, iIdx) => {
        if (!isVisibleInViewport(inp)) return;
        const val = inp.value.trim();
        const ph = inp.placeholder || '';
        parts.push(`[Blank/Field ${iIdx + 1}]: Current: "${val}" (Placeholder: "${ph}")`);
      });

      // 5. Extract MathJax / KaTeX / LaTeX expressions
      const mathNodes = document.querySelectorAll('.katex, .MathJax, math, [data-latex]');
      mathNodes.forEach((mn, mIdx) => {
        if (!isVisibleInViewport(mn)) return;
        const latex = mn.getAttribute('data-latex') || mn.getAttribute('alt') || mn.innerText.trim();
        if (latex) parts.push(`[Math Formulation ${mIdx + 1}]: ${latex}`);
      });

      // 6. Extract Preformatted & Stem-and-Leaf Blocks
      const pres = document.querySelectorAll('pre, code');
      pres.forEach((pr, pIdx) => {
        if (!isVisibleInViewport(pr)) return;
        const txt = pr.innerText.trim();
        if (txt) parts.push(`[Preformatted/Data Block ${pIdx + 1}]:\n${txt}`);
      });

      // 7. Extract Visible Question Content — safe scope check & robust fallback
      let foundContainerText = '';

      try {
        let activeEl = null;

        if (typeof currentTargetQuestionEl !== 'undefined' && currentTargetQuestionEl) {
          activeEl = currentTargetQuestionEl;
        } else if (typeof window !== 'undefined' && window.currentTargetQuestionEl) {
          activeEl = window.currentTargetQuestionEl;
        } else if (typeof getQuestionTargetElement === 'function') {
          try { activeEl = getQuestionTargetElement(); } catch (_) { activeEl = null; }
        }

        if (!activeEl) {
          activeEl = document.querySelector(
            '.QuestionText, .question-wrapper, .quiz-question, [id*="Question"], [class*="question"], .divQuestion'
          ) || document.body;
        }

        if (activeEl && activeEl !== document.body) {
          foundContainerText = (activeEl.innerText || activeEl.textContent || '').trim();
        }
      } catch (scopeErr) {
        console.warn('[Client-Side OCR] Target question element scoping fallback:', scopeErr);
      }

      // Fallback: scan known SABIS question selectors
      if (!foundContainerText) {
        const sabisQSelectors = [
          '.divQuestion', '[id^="divQuestion"]:not(#divQuestions)',
          '.QuestionText', '.question-wrapper', '.quiz-question',
          '.question-container', '.question-card', '.question-item'
        ];
        for (const sel of sabisQSelectors) {
          let nodes;
          try { nodes = document.querySelectorAll(sel); } catch (_) { continue; }
          for (const qn of nodes) {
            if (!isVisibleInViewport(qn)) continue;
            const t = (qn.innerText || '').trim();
            if (t.length > foundContainerText.length) foundContainerText = t;
          }
        }
      }

      if (foundContainerText) {
        parts.push(`[Question Body]:\n${foundContainerText}`);
      } else {
        const bodyText = (document.body ? document.body.innerText : '') || '';
        const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length > 0) {
          parts.push(`[Viewport Content]:\n${lines.slice(0, 60).join('\n')}`);
        }
      }

      return parts.join('\n\n').trim();
    } catch (err) {
      console.warn('[Client-Side OCR] Extraction warning:', err);
      return '';
    }
  }

  // ── Build Shadow DOM UI Tree ────────────────────────────────────────────────
  function createShadowUI() {
    host = document.createElement('div');
    host.id = 'academic-solver-root';

    shadow = host.attachShadow({ mode: 'open' });

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

    // 4. Input auto-fill anti-hijacking attributes on prompt bar
    promptInput = document.createElement('input');
    promptInput.id = 'prompt-input';
    promptInput.type = 'text';
    promptInput.placeholder = 'Custom instruction...';
    promptInput.setAttribute('autocomplete', 'off');
    promptInput.setAttribute('autocorrect', 'off');
    promptInput.setAttribute('autocapitalize', 'off');
    promptInput.setAttribute('spellcheck', 'false');
    promptInput.setAttribute('data-lpignore', 'true');
    promptInput.setAttribute('aria-autocomplete', 'none');

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
    answerText.className = 'answer-text';
    answerText.textContent = formatAnswerForBar(currentAnswerText);

    answerContainer.appendChild(answerText);

    uiWrapper.appendChild(bottomControlsBar);
    uiWrapper.appendChild(answerContainer);

    // ── Build Custom In-Page Center Modal (iOS 27 Liquid Glass Stack) ─────────
    settingsModalBackdrop = document.createElement('div');
    settingsModalBackdrop.id = 'settings-modal-backdrop';
    settingsModalBackdrop.style.setProperty('display', 'none', 'important');
    settingsModalBackdrop.style.setProperty('opacity', '0', 'important');
    settingsModalBackdrop.style.setProperty('visibility', 'hidden', 'important');
    settingsModalBackdrop.style.setProperty('pointer-events', 'none', 'important');

    settingsModalDialog = document.createElement('div');
    settingsModalDialog.id = 'settings-modal-dialog';
    settingsModalDialog.style.setProperty('display', 'none', 'important');
    settingsModalDialog.style.setProperty('opacity', '0', 'important');
    settingsModalDialog.style.setProperty('visibility', 'hidden', 'important');
    settingsModalDialog.style.setProperty('pointer-events', 'none', 'important');
    settingsModalDialog.innerHTML = `
      <div id="modal-dropdown-backdrop" class="modal-dropdown-backdrop"></div>
      <div id="modal-save-toast">
        <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor">
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
        </svg>
        <span>Saved</span>
      </div>

      <header id="settings-modal-header">
        <div class="modal-logo-area">
          <div class="modal-logo-dot"></div>
          <h2 class="modal-header-title">SABIS KILLER <span class="modal-version-tag">v2.1</span></h2>
        </div>
        <div class="modal-header-right">
          <div id="inpage-status-badge" class="modal-status-badge status-missing">
            <span class="status-dot"></span>
            <span id="inpage-status-text">No Key</span>
          </div>
          <button type="button" id="settings-modal-close" title="Close Settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </header>

      <main id="settings-modal-content">
        <!-- Google AI Studio Configuration -->
        <div class="modal-form-group">
          <label class="modal-section-label">Google AI Studio Configuration</label>
        </div>

        <!-- Google Gemini Card -->
        <div class="modal-provider-card active" id="inpage-card-gemini">
          <div class="modal-form-group">
            <label for="inpage-apiKey-gemini">Gemini API Key</label>
            <div class="modal-input-wrapper">
              <input type="password" id="inpage-apiKey-gemini" class="modal-api-key-input" placeholder="AIzaSy..."
                autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" aria-autocomplete="none">
              <button type="button" class="modal-toggle-eye" data-target="inpage-apiKey-gemini" title="Show/Hide Key">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </div>
            <span class="modal-form-hint">Obtain from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Google AI Studio</a></span>
          </div>

          <div class="modal-form-group">
            <label>Model</label>
            <div class="modal-custom-select-wrapper" id="wrapper-inpage-models-gemini" data-select-id="inpage-models-gemini">
              <input type="hidden" id="inpage-models-gemini" value="auto_dynamic">
              <button type="button" class="modal-custom-select-trigger" aria-haspopup="listbox" aria-expanded="false">
                <span class="modal-custom-select-label">Auto-Dynamic Model Picker</span>
                <svg class="modal-custom-select-chevron" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <div class="modal-custom-options-panel" role="listbox">
                <div class="modal-custom-option selected" data-value="auto_dynamic" role="option">
                  <span class="modal-custom-option-text">Auto-Dynamic Model Picker</span>
                  <svg class="modal-custom-option-check" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div class="modal-custom-option" data-value="gemini-3.8-flash" role="option">
                  <span class="modal-custom-option-text">Gemini 3.8 Flash</span>
                  <svg class="modal-custom-option-check" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div class="modal-custom-option" data-value="gemini-3.6-flash" role="option">
                  <span class="modal-custom-option-text">Gemini 3.6 Flash</span>
                  <svg class="modal-custom-option-check" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div class="modal-custom-option" data-value="gemini-3.5-flash-lite" role="option">
                  <span class="modal-custom-option-text">Gemini 3.5 Flash-Lite</span>
                  <svg class="modal-custom-option-check" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div class="modal-custom-option" data-value="gemini-3.1-flash-lite" role="option">
                  <span class="modal-custom-option-text">Gemini 3.1 Flash-Lite</span>
                  <svg class="modal-custom-option-check" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div class="modal-custom-option" data-value="gemini-2.5-flash" role="option">
                  <span class="modal-custom-option-text">Gemini 2.5 Flash</span>
                  <svg class="modal-custom-option-check" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-divider"></div>

        <!-- Appearance Section -->
        <label class="modal-section-label">UI & Appearance</label>

        <!-- Glass Refraction Slider -->
        <div class="modal-appearance-card">
          <div class="modal-control-row">
            <div>
              <span class="modal-control-title">Glass Refraction</span>
              <p class="modal-control-sub">0% = Opaque solid &middot; 100% = Liquid glass</p>
            </div>
            <span id="inpage-glass-val" class="modal-badge">70%</span>
          </div>
          <input type="range" id="inpage-glass-slider" min="0" max="100" value="70" class="modal-range-slider">
        </div>

        <!-- Custom Prompt Toggle -->
        <div class="modal-appearance-card">
          <div class="modal-control-row">
            <div>
              <span class="modal-control-title">Prompt Bar</span>
              <p class="modal-control-sub">Display custom instruction bar on webpage</p>
            </div>
            <label class="modal-switch">
              <input type="checkbox" id="inpage-enable-prompt" checked>
              <span class="modal-switch-slider"></span>
            </label>
          </div>
        </div>

        <!-- Study Mode Toggle -->
        <div class="modal-appearance-card">
          <div class="modal-control-row">
            <div>
              <span class="modal-control-title">Study Mode</span>
              <p class="modal-control-sub">Interactive liquid glass bubble, simple explanation, diagram area &amp; follow-up prompt</p>
            </div>
            <label class="modal-switch">
              <input type="checkbox" id="inpage-enable-study-mode">
              <span class="modal-switch-slider"></span>
            </label>
          </div>
        </div>

        <!-- Answer Typography (Pure black default, zero shadow) -->
        <div class="modal-appearance-card">
          <span class="modal-control-title">Answer Typography</span>
          <div class="modal-control-row" style="margin-top: 8px;">
            <span class="modal-control-label">Text Color</span>
            <div class="modal-color-picker-group">
              <input type="color" id="inpage-answer-color-picker" value="#000000" class="modal-color-swatch">
              <input type="text" id="inpage-answer-color-hex" value="#000000" maxlength="7" class="modal-hex-input"
                autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true">
            </div>
          </div>
          <div class="modal-control-row" style="margin-top: 8px;">
            <span class="modal-control-label">Font Size</span>
            <div class="modal-slider-group">
              <input type="range" id="inpage-answer-font-size" min="10" max="28" value="14" class="modal-range-slider">
              <span id="inpage-answer-font-size-val" class="modal-badge">14px</span>
            </div>
          </div>
          <div class="modal-position-actions">
            <button type="button" class="modal-btn-pill inpage-change-pos" data-target="answer">Change Position</button>
            <button type="button" class="modal-btn-pill reset-btn inpage-reset-pos" data-target="answer">Reset</button>
          </div>
        </div>

        <!-- Screenshot Button Card -->
        <div class="modal-appearance-card">
          <span class="modal-control-title">Screenshot Button</span>
          <div class="modal-control-row" style="margin-top: 8px;">
            <span class="modal-control-label">Button Color</span>
            <div class="modal-color-picker-group">
              <input type="color" id="inpage-button-color-picker" value="#FFFFFF" class="modal-color-swatch">
              <input type="text" id="inpage-button-color-hex" value="#FFFFFF" maxlength="7" class="modal-hex-input"
                autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true">
            </div>
          </div>
          <div class="modal-control-row" style="margin-top: 8px;">
            <span class="modal-control-label">Button Size</span>
            <div class="modal-slider-group">
              <input type="range" id="inpage-button-size" min="20" max="60" value="30" class="modal-range-slider">
              <span id="inpage-button-size-val" class="modal-badge">30px</span>
            </div>
          </div>
          <div class="modal-position-actions">
            <button type="button" class="modal-btn-pill inpage-change-pos" data-target="button">Change Position</button>
            <button type="button" class="modal-btn-pill reset-btn inpage-reset-pos" data-target="button">Reset</button>
          </div>
        </div>

        <!-- Prompt Bar Style Card -->
        <div class="modal-appearance-card">
          <span class="modal-control-title">Prompt Bar Style</span>
          <div class="modal-control-row" style="margin-top: 8px;">
            <span class="modal-control-label">Bar Color</span>
            <div class="modal-color-picker-group">
              <input type="color" id="inpage-prompt-color-picker" value="#FFFFFF" class="modal-color-swatch">
              <input type="text" id="inpage-prompt-color-hex" value="#FFFFFF" maxlength="7" class="modal-hex-input"
                autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true">
            </div>
          </div>
          <div class="modal-control-row" style="margin-top: 8px;">
            <span class="modal-control-label">Bar Width</span>
            <div class="modal-slider-group">
              <input type="range" id="inpage-prompt-width" min="120" max="400" value="180" class="modal-range-slider">
              <span id="inpage-prompt-width-val" class="modal-badge">180px</span>
            </div>
          </div>
          <div class="modal-position-actions">
            <button type="button" class="modal-btn-pill inpage-change-pos" data-target="prompt">Change Position</button>
            <button type="button" class="modal-btn-pill reset-btn inpage-reset-pos" data-target="prompt">Reset</button>
          </div>
        </div>
      </main>
    `;

    modalSaveToast = settingsModalDialog.querySelector('#modal-save-toast');

    // Attach to shadow root
    shadow.appendChild(hiddenToggleZone);
    shadow.appendChild(uiWrapper);
    shadow.appendChild(settingsModalBackdrop);
    shadow.appendChild(settingsModalDialog);

    // Modal Event Listeners
    settingsModalBackdrop.addEventListener('click', closeSettingsModal);
    const closeBtn = settingsModalDialog.querySelector('#settings-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeSettingsModal);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isModalOpen) {
        closeSettingsModal();
      }
    });

    // Provider Tabs
    settingsModalDialog.querySelectorAll('.modal-segmented-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prov = btn.getAttribute('data-provider');
        switchModalProvider(prov);
      });
    });

    // Eye Password Toggles
    settingsModalDialog.querySelectorAll('.modal-toggle-eye').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = shadow.getElementById(targetId);
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.innerHTML = isPassword
          ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
               <line x1="1" y1="1" x2="23" y2="23"></line>
             </svg>`
          : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
               <circle cx="12" cy="12" r="3"></circle>
             </svg>`;
      });
    });

    // Glass Refraction Slider
    const glassSlider = settingsModalDialog.querySelector('#inpage-glass-slider');
    const glassBadge = settingsModalDialog.querySelector('#inpage-glass-val');
    if (glassSlider && glassBadge) {
      glassSlider.addEventListener('input', () => {
        glassBadge.textContent = `${glassSlider.value}%`;
        applyGlassRefraction(glassSlider.value);
        autoSaveModal();
      });
    }

    // Prompt Bar Toggle
    const promptToggle = settingsModalDialog.querySelector('#inpage-enable-prompt');
    if (promptToggle) {
      promptToggle.addEventListener('change', () => autoSaveModal());
    }

    // Study Mode Toggle
    const studyToggle = settingsModalDialog.querySelector('#inpage-enable-study-mode');
    if (studyToggle) {
      studyToggle.addEventListener('change', () => autoSaveModal());
    }

    // Helper: Bind Color Picker and Hex Input Pair
    function bindColorSync(pickerId, hexId) {
      const p = shadow.getElementById(pickerId);
      const h = shadow.getElementById(hexId);
      if (!p || !h) return;
      p.addEventListener('input', () => {
        h.value = p.value.toUpperCase();
        autoSaveModal();
      });
      h.addEventListener('input', () => {
        let v = h.value.trim();
        if (!v.startsWith('#')) v = '#' + v;
        if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
          p.value = v;
          autoSaveModal();
        }
      });
    }

    function bindSliderSync(sliderId, badgeId, unit = '') {
      const s = shadow.getElementById(sliderId);
      const b = shadow.getElementById(badgeId);
      if (!s || !b) return;
      s.addEventListener('input', () => {
        b.textContent = `${s.value}${unit}`;
        autoSaveModal();
      });
    }

    bindColorSync('inpage-answer-color-picker', 'inpage-answer-color-hex');
    bindSliderSync('inpage-answer-font-size', 'inpage-answer-font-size-val', 'px');

    bindColorSync('inpage-button-color-picker', 'inpage-button-color-hex');
    bindSliderSync('inpage-button-size', 'inpage-button-size-val', 'px');

    bindColorSync('inpage-prompt-color-picker', 'inpage-prompt-color-hex');
    bindSliderSync('inpage-prompt-width', 'inpage-prompt-width-val', 'px');

    // Auto-save listeners on all API key and model fields
    // (model fields are now hidden inputs driven by the custom dropdown; 'change' fires on selection)
    Object.keys(PROVIDERS).forEach(prov => {
      const conf = PROVIDERS[prov];
      const keyEl = shadow.getElementById(conf.keyInputId);
      const modelEl = shadow.getElementById(conf.modelSelectId);
      if (keyEl) {
        keyEl.addEventListener('input', () => autoSaveModal());
        keyEl.addEventListener('change', () => autoSaveModal());
      }
      if (modelEl) {
        modelEl.addEventListener('change', () => autoSaveModal());
      }
    });

    // Initialise all custom liquid-glass dropdowns inside modal
    initModalCustomSelects();

    // Position Action Buttons inside Modal
    settingsModalDialog.querySelectorAll('.inpage-change-pos, #change-position-btn, .change-pos-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const target = btn.getAttribute('data-target') || 'panel';
        startPositionPicker(target);
      });
    });

    settingsModalDialog.querySelectorAll('.inpage-reset-pos, .reset-btn, .reset-pos-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const target = btn.getAttribute('data-target') || 'panel';
        positions[target] = null;
        try {
          const keysToRemove = [`${target}_position`, `pos_${target}`];
          if (target === 'answer' || target === 'panel') {
            keysToRemove.push('panelPosition', 'panel_position');
          }
          chrome.storage.local.remove(keysToRemove, () => {
            resetTargetPosition(target);
            showModalToast('Position Reset');
          });
        } catch (_) {
          resetTargetPosition(target);
        }
      });
    });

    loadStoredSettings();

    if (window.ResizeObserver && answerContainer) {
      try {
        const ro = new ResizeObserver(() => {
          updateAnswerBoundaryShift();
        });
        ro.observe(answerContainer);
      } catch (_) {}
    }
    window.addEventListener('resize', updateAnswerBoundaryShift);

    // Stealth Toggle Zone
    hiddenToggleZone.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      isUIVisible = !isUIVisible;
      uiWrapper.style.display = isUIVisible ? 'block' : 'none';
      if (studyBubbleContainer) {
        studyBubbleContainer.style.display = isUIVisible ? 'block' : 'none';
      }
      try {
        chrome.storage.local.set({ is_ui_visible: isUIVisible, ui_visible: isUIVisible });
      } catch (_) {}
    });

    // ── Study Mode Helper & UI Bubble Subsystem ──────────────────────────────
    currentTargetQuestionEl = null;

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function getElementTrueBoundingRect(el) {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const vW = window.innerWidth  || document.documentElement.clientWidth;
      const vH = window.innerHeight || document.documentElement.clientHeight;

      let top    = rect.top;
      let left   = rect.left;
      let right  = rect.right;
      let bottom = rect.bottom;

      // Walk all visible descendants and expand the bounding union to cover them.
      // This is critical for SABIS: a question div may have a narrow container
      // but a wide table inside — we must capture the full rendered extent.
      const descendants = el.querySelectorAll(
        'table, thead, tbody, tr, td, th, img, svg, canvas, ' +
        'input, select, textarea, button, label, p, span, div, .subQuestion'
      );

      descendants.forEach(d => {
        // Skip zero-size and hidden nodes fast
        if (d.offsetWidth === 0 && d.offsetHeight === 0) return;
        const s = window.getComputedStyle(d);
        if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return;

        const dR = d.getBoundingClientRect();
        // Ignore degenerate rects and anything spanning the full viewport
        // (those are page wrappers, not question content)
        if (dR.width <= 0 || dR.height <= 0) return;
        if (dR.width >= vW * 0.95 && dR.height >= vH * 0.95) return;

        if (dR.left   < left)   left   = dR.left;
        if (dR.top    < top)    top    = dR.top;
        if (dR.right  > right)  right  = dR.right;
        if (dR.bottom > bottom) bottom = dR.bottom;
      });

      // Clamp result to viewport bounds — never return negative coords or overflow
      top    = Math.max(0, top);
      left   = Math.max(0, left);
      right  = Math.min(vW, right);
      bottom = Math.min(vH, bottom);

      const width  = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);

      // Return null for degenerate results so caller triggers fallback
      if (width < 10 || height < 10) return null;

      return { top, left, right, bottom, width, height };
    }

    /**
     * ROBUST SABIS QUESTION DOM DETECTOR
     * Multi-strategy cascade — exhausts every known SABIS DOM pattern
     * before falling back to heuristic text/input detection.
     * Returns the tightest single question card element, never the outer page wrapper.
     */
    function getQuestionTargetElement() {
      const vH = window.innerHeight || document.documentElement.clientHeight;
      const vW = window.innerWidth  || document.documentElement.clientWidth;

      // ── helpers ──────────────────────────────────────────────────────────────
      const isOurs = (el) =>
        el && (el.id === 'academic-solver-root' || !!el.closest('#academic-solver-root'));

      const isPageWrapper = (el) => {
        if (!el) return true;
        const tag = el.tagName.toUpperCase();
        if (['HTML','BODY','MAIN','FORM','ARTICLE','SECTION','NAV','HEADER','FOOTER'].includes(tag)) return true;
        if (el.id === 'divQuestions') return true; // SABIS outer quiz list
        const id  = (el.id || '').toLowerCase();
        const cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
        if (id.includes('divquestions') || id.includes('quizcontainer')) return true;
        if (cls.includes('quiz-container') || cls.includes('page-wrapper') || cls.includes('content-area')) return true;
        return false;
      };

      // Returns true if the rect is visible and plausibly question-sized
      const isVisibleCard = (r) =>
        r.width > 60 && r.height > 30 &&
        r.bottom > 20 && r.top < vH - 20 &&
        r.right  > 20 && r.left < vW - 20 &&
        r.width  < vW * 0.92 &&   // not full-screen-wide
        r.height < vH * 0.92;     // not full-screen-tall

      const isRendered = (el) => {
        const s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
      };

      // Does el contain multiple sibling question cards? → it's a wrapper, not a card
      const isWrapper = (el) => {
        const innerCards = el.querySelectorAll(
          '.divQuestion, [id^="divQuestion"]:not(#divQuestions), .QuestionText, .quiz-question-box, .question-container'
        );
        return innerCards.length > 1;
      };

      // ── Strategy 1 : SABIS-specific ID/class selectors (highest confidence) ──
      const sabisSelectors = [
        // SABIS student portal specific
        '.divQuestion:not(#divQuestions)',
        '[id^="divQuestion"]:not(#divQuestions)',
        // Common quiz wrappers
        '.QuestionText',
        '.question-wrapper',
        '.quiz-question',
        '.quiz-question-box',
        '.question-container',
        '.question-card',
        '.question-item',
        '.exam-question',
        '.problem-container',
        // Attribute-pattern fallbacks
        '[id*="Question"]:not(#divQuestions)',
        '[class*="question"]:not(body):not(html)',
      ];

      for (const sel of sabisSelectors) {
        let nodes;
        try { nodes = document.querySelectorAll(sel); } catch (_) { continue; }
        for (const el of nodes) {
          if (isOurs(el) || isPageWrapper(el) || isWrapper(el)) continue;
          if (!isRendered(el)) continue;
          const r = el.getBoundingClientRect();
          if (isVisibleCard(r)) return el;
        }
      }

      // ── Strategy 2 : Walk up from visible input/select/radio controls ──────
      // SABIS fill-in-the-blank & MCQ both have inputs inside the question card
      const interactiveEls = Array.from(document.querySelectorAll(
        'input[type="text"], input[type="number"], input:not([type]), select, textarea, input[type="radio"], input[type="checkbox"], .quiz-option'
      )).filter(inp => {
        if (isOurs(inp)) return false;
        const r = inp.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.bottom > 20 && r.top < vH - 20;
      });

      const inputAncestorSelectors = [
        '.divQuestion', '[id^="divQuestion"]:not(#divQuestions)',
        '.QuestionText', '.question-wrapper', '.question-container',
        '.quiz-question-box', '.question-card', '.question',
        'td', 'div[style*="width"]', '.card',
      ];

      for (const inp of interactiveEls) {
        for (const anc of inputAncestorSelectors) {
          const card = inp.closest(anc);
          if (!card || isOurs(card) || isPageWrapper(card) || isWrapper(card)) continue;
          if (!isRendered(card)) continue;
          const r = card.getBoundingClientRect();
          if (isVisibleCard(r)) return card;
        }
      }

      // ── Strategy 3 : Find visible table (frequency tables, data sets) ────────
      // Then walk up to the containing question card
      const tables = Array.from(document.querySelectorAll('table')).filter(t => {
        if (isOurs(t)) return false;
        const r = t.getBoundingClientRect();
        return r.width > 50 && r.height > 20 && r.bottom > 20 && r.top < vH - 20;
      });

      for (const tbl of tables) {
        const card = tbl.closest(
          '.divQuestion, [id^="divQuestion"]:not(#divQuestions), .QuestionText, .question-wrapper, .question-container, .quiz-question-box, .question-card, .question'
        );
        if (card && !isOurs(card) && !isPageWrapper(card) && !isWrapper(card) && isRendered(card)) {
          const r = card.getBoundingClientRect();
          if (isVisibleCard(r)) return card;
        }
        // If no named ancestor, use the table's parent if it's a plausible card
        const tblParent = tbl.parentElement;
        if (tblParent && !isOurs(tblParent) && !isPageWrapper(tblParent) && isRendered(tblParent)) {
          const r = tblParent.getBoundingClientRect();
          if (isVisibleCard(r) && !isWrapper(tblParent)) return tblParent;
        }
      }

      // ── Strategy 4 : Text-content heuristic ─────────────────────────────────
      // Find the smallest visible div/p that contains typical question phrasing
      const questionPhrases = [
        'fill in', 'what is', 'which of', 'select all', 'calculate',
        'find the', 'how many', 'consider', 'given that', 'solve',
        'determine', 'evaluate', 'simplify', 'complete', 'match'
      ];

      const textNodes = Array.from(document.querySelectorAll('div, p, td, li, span')).filter(node => {
        if (isOurs(node) || isPageWrapper(node)) return false;
        if (!isRendered(node)) return false;
        const r = node.getBoundingClientRect();
        if (!isVisibleCard(r)) return false;
        const txt = (node.innerText || node.textContent || '').toLowerCase().trim();
        if (txt.length < 8) return false;
        return questionPhrases.some(ph => txt.includes(ph));
      });

      // Sort by area (smallest first) to get tightest question match
      textNodes.sort((a, b) => {
        const rA = a.getBoundingClientRect();
        const rB = b.getBoundingClientRect();
        return (rA.width * rA.height) - (rB.width * rB.height);
      });

      for (const node of textNodes) {
        // Walk up to find a sensible card boundary
        const cardCandidates = [
          node.closest('.divQuestion, [id^="divQuestion"]:not(#divQuestions), .QuestionText, .question-wrapper, .question-container, .question-card'),
          node.parentElement,
          node.closest('td'),
          node.closest('div[style]'),
        ].filter(Boolean);

        for (const candidate of cardCandidates) {
          if (isOurs(candidate) || isPageWrapper(candidate) || isWrapper(candidate)) continue;
          if (!isRendered(candidate)) continue;
          const r = candidate.getBoundingClientRect();
          if (isVisibleCard(r)) return candidate;
        }
      }

      // ── Strategy 5 : Largest visible block of interactive content ───────────
      // Last resort: find the smallest visible div that contains ≥1 input and
      // ≥10 chars of question text — approximate "question card" on any platform
      const allDivs = Array.from(document.querySelectorAll('div, td')).filter(el => {
        if (isOurs(el) || isPageWrapper(el) || isWrapper(el)) return false;
        if (!isRendered(el)) return false;
        const r = el.getBoundingClientRect();
        return isVisibleCard(r) && el.querySelectorAll('input, select, textarea').length >= 1;
      });

      // Sort smallest area first to prefer tight question cards over big containers
      allDivs.sort((a, b) => {
        const rA = a.getBoundingClientRect();
        const rB = b.getBoundingClientRect();
        return (rA.width * rA.height) - (rB.width * rB.height);
      });

      for (const el of allDivs) {
        const txt = (el.innerText || '').trim();
        if (txt.length >= 10) return el;
      }

      return null; // Genuinely no question found — let cutout use fallback rect
    }

    function measureFallbackRectFromDOM() {
      // Build a real bounding rect from whatever IS visible on screen
      // rather than using hardcoded pixel percentages.
      const vW = window.innerWidth  || document.documentElement.clientWidth;
      const vH = window.innerHeight || document.documentElement.clientHeight;

      // Collect all visible interactive + text nodes on screen
      const candidates = Array.from(document.querySelectorAll(
        'input, select, textarea, table, p, li, td, label, img, svg'
      )).filter(el => {
        if (el.closest('#academic-solver-root')) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 &&
               r.top  < vH - 10 && r.bottom > 10 &&
               r.left < vW - 10 && r.right  > 10;
      });

      if (candidates.length === 0) return null;

      // Union of all candidate rects — the tightest real bounding box on screen
      let top    = Infinity,  left   = Infinity;
      let right  = -Infinity, bottom = -Infinity;

      candidates.forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.top    < top)    top    = r.top;
        if (r.left   < left)   left   = r.left;
        if (r.right  > right)  right  = r.right;
        if (r.bottom > bottom) bottom = r.bottom;
      });

      // Clamp to viewport — never let the fallback overflow
      top    = Math.max(8,  top);
      left   = Math.max(8,  left);
      right  = Math.min(vW - 8, right);
      bottom = Math.min(vH - 8, bottom);

      // Sanity-check minimum size
      if (right - left < 60 || bottom - top < 30) return null;

      return { top, left, right, bottom, width: right - left, height: bottom - top };
    }

    function calculateQuestionCutout(targetElement) {
      // Fresh element detection on every call — never rely on a stale ref
      const targetEl = targetElement || getQuestionTargetElement();
      const vWidth   = window.innerWidth  || document.documentElement.clientWidth;
      const vHeight  = window.innerHeight || document.documentElement.clientHeight;

      let rect = null;
      if (targetEl) {
        // Full descendant union bounding rect — includes tables, inputs, SVGs
        rect = getElementTrueBoundingRect(targetEl);
      }

      // If the detected element produced a degenerate rect, try DOM measurement
      if (!rect || rect.width < 50 || rect.height < 30) {
        rect = measureFallbackRectFromDOM();
      }

      // Absolute last resort: reasonable proportional estimate
      // (only reached when the page has zero visible content — e.g. during load)
      if (!rect || rect.width < 50 || rect.height < 30) {
        rect = {
          top:    Math.round(vHeight * 0.10),
          left:   Math.round(vWidth  * 0.05),
          width:  Math.round(vWidth  * 0.58),
          height: Math.round(vHeight * 0.70)
        };
      }

      // Adaptive padding based on question height relative to viewport
      //   tiny  (<15% vH) → 20px  dropdown / short answer
      //   large (>55% vH) → 12px  data table / multi-row
      //   else            → 16px  normal question
      let padding = 16;
      const heightRatio = rect.height / vHeight;
      if      (heightRatio < 0.15) padding = 20;
      else if (heightRatio > 0.55) padding = 12;

      // Container is position:fixed — getBoundingClientRect() is already in viewport coords
      // NEVER add scrollX/scrollY here
      const cutoutTop    = Math.max(8,   Math.round(rect.top  - padding));
      const cutoutLeft   = Math.max(8,   Math.round(rect.left - padding));
      const cutoutWidth  = Math.max(220, Math.round(rect.width  + padding * 2));
      const cutoutHeight = Math.max(60,  Math.round(rect.height + padding * 2));

      return { element: targetEl, rect, padding, cutoutTop, cutoutLeft, cutoutWidth, cutoutHeight };
    }

    function getQuestionBoundingRect(targetEl) {
      const cutout = calculateQuestionCutout(targetEl);
      return {
        left: cutout.cutoutLeft,
        top: cutout.cutoutTop,
        right: cutout.cutoutLeft + cutout.cutoutWidth,
        bottom: cutout.cutoutTop + cutout.cutoutHeight,
        width: cutout.cutoutWidth,
        height: cutout.cutoutHeight,
        element: cutout.element
      };
    }

    function mountStudyLoadingPill(statusText = 'Analyzing question layout...') {
      if (!shadow) return;
      unmountStudyLoadingPill();
      unmountStudyBubble();

      studyLoadingPill = document.createElement('div');
      studyLoadingPill.id = 'sabis-study-loading-pill';
      studyLoadingPill.innerHTML = `
        <div class="study-loading-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path>
            <path d="M2 12h20"></path>
          </svg>
        </div>
        <span class="study-loading-text">${escapeHtml(statusText)}</span>
      `;
      shadow.appendChild(studyLoadingPill);
    }

    function updateStudyLoadingPillText(text) {
      if (!studyLoadingPill) return;
      const txtEl = studyLoadingPill.querySelector('.study-loading-text');
      if (txtEl) txtEl.textContent = text;
    }

    function unmountStudyLoadingPill() {
      if (studyLoadingPill && studyLoadingPill.parentNode) {
        studyLoadingPill.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        studyLoadingPill.style.opacity = '0';
        studyLoadingPill.style.transform = 'translate(-50%, -54%) scale(0.95)';
        const oldPill = studyLoadingPill;
        setTimeout(() => {
          try {
            if (oldPill && oldPill.parentNode) {
              oldPill.parentNode.removeChild(oldPill);
            }
          } catch (_) {}
        }, 200);
      }
      studyLoadingPill = null;
    }

    function applyDynamicPolygonCutout(polygonPoints) {
      const container = document.getElementById('sabis-study-bubble-container') ||
                        (typeof shadow !== 'undefined' && shadow && shadow.getElementById('sabis-study-bubble-container')) ||
                        studyBubbleContainer;
      if (!container || !polygonPoints || polygonPoints.length === 0) return;

      // Convert percentage points [x, y] into viewport pixel coordinates
      const pixelPoints = polygonPoints.map(pt => {
        const px = (pt[0] / 100) * window.innerWidth;
        const py = (pt[1] / 100) * window.innerHeight;
        return `${px.toFixed(1)}px ${py.toFixed(1)}px`;
      });

      // To create a hole-punch cutout with clip-path, we map from viewport edges inward to the polygon vertex loop, then back out
      // Or apply a precise polygon mask covering the screen minus the question bounds.
      // Cleanest implementation for an irregular polygon window on an absolute overlay:

      // Build an outer boundary rectangle covering the screen, then trace the inner polygon counter-clockwise
      const outerBox = "0% 0%, 100% 0%, 100% 100%, 0% 100%";

      // If points are provided, construct the composite polygon clip path
      // Format: polygon(outer clockwise box..., inner counter-clockwise polygon...)
      const innerPath = pixelPoints.join(', ');

      // Apply directly to the liquid glass container's inline style
      // This smoothly morphs the shape instantly when the loading screen disappears
      container.style.clipPath = `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, ${innerPath})`;
      container.style.webkitClipPath = container.style.clipPath;

      // Using evenodd fill-rule eliminates corner artifacts and diagonal cut-lines across viewport
      const evenOddPath = `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, ${innerPath})`;
      container.style.clipPath = evenOddPath;
      container.style.webkitClipPath = evenOddPath;

      if (!container.style.clipPath) {
        container.style.clipPath = `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, ${innerPath})`;
        container.style.webkitClipPath = container.style.clipPath;
      }

      // Also apply to inner encompassing glass layer if present
      const glassBg = container.querySelector('#study-encompassing-glass-bg');
      if (glassBg) {
        glassBg.style.clipPath = container.style.clipPath;
        glassBg.style.webkitClipPath = container.style.webkitClipPath;
      }

      console.log("[SABIS KILLER] Smooth Dynamic Polygon Cutout Applied Successfully.");
    }
    if (typeof window !== 'undefined') {
      window.applyDynamicPolygonCutout = applyDynamicPolygonCutout;
    }

    function calculateEncompassingLayout(cutout, layoutData = null) {
      const vW = window.innerWidth || document.documentElement.clientWidth;
      const vH = window.innerHeight || document.documentElement.clientHeight;

      const MARGIN_TOP = 42; // Headroom for "ACTIVE QUESTION" frosted tag and close button
      const MARGIN_LEFT = 20;
      const MARGIN_BOTTOM = 24;
      const MARGIN_RIGHT = 20;
      const GAP_BETWEEN = 20;
      const DEFAULT_BAY_WIDTH = 380;
      const MIN_BAY_WIDTH = 280;

      let safeCutoutLeft, safeCutoutTop, safeCutoutWidth, safeCutoutHeight;
      let panelPlacement = 'right';
      let customPolygonPts = null;

      const effectiveLayout = layoutData || currentStudyLayoutData;

      if (effectiveLayout && Array.isArray(effectiveLayout.question_polygon_normalized) && effectiveLayout.question_polygon_normalized.length >= 3) {
        // ── STAGE 1 AI VISION COORDINATE PROJECTION ──
        // Convert normalized 0-100 percentage coordinates to viewport pixels
        const rawPts = effectiveLayout.question_polygon_normalized.map(([x, y]) => [
          Math.max(0, Math.min(vW, (Number(x) / 100) * vW)),
          Math.max(0, Math.min(vH, (Number(y) / 100) * vH))
        ]);
        const xs = rawPts.map(p => p[0]);
        const ys = rawPts.map(p => p[1]);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const pad = 14;
        safeCutoutLeft = Math.max(8, Math.round(minX - pad));
        safeCutoutTop = Math.max(8, Math.round(minY - pad));
        safeCutoutWidth = Math.max(200, Math.min(vW - safeCutoutLeft - 16, Math.round((maxX - minX) + pad * 2)));
        safeCutoutHeight = Math.max(60, Math.min(vH - safeCutoutTop - 16, Math.round((maxY - minY) + pad * 2)));

        if (['right', 'bottom', 'top', 'left'].includes(effectiveLayout.optimal_panel_placement)) {
          panelPlacement = effectiveLayout.optimal_panel_placement;
        }

        if (effectiveLayout.cutout_shape === 'irregular_polygon' && rawPts.length >= 4) {
          customPolygonPts = rawPts;
        }
      } else {
        // ── DOM-BASED MEASUREMENT FALLBACK ──
        safeCutoutLeft = Math.max(12, cutout.cutoutLeft);
        safeCutoutTop = Math.max(12, cutout.cutoutTop);
        const maxCutoutWidth = Math.max(260, vW - safeCutoutLeft - MIN_BAY_WIDTH - GAP_BETWEEN - MARGIN_RIGHT);
        safeCutoutWidth = Math.min(maxCutoutWidth, cutout.cutoutWidth);
        safeCutoutHeight = Math.min(vH - safeCutoutTop - MARGIN_BOTTOM - 12, cutout.cutoutHeight);
      }

      // Next: compute encompassing card geometry according to panelPlacement
      let cardLeft, cardTop, cardWidth, cardHeight;
      let innerCutoutLeft, innerCutoutTop, innerCutoutWidth, innerCutoutHeight;
      let contentBayLeft, contentBayTop, contentBayWidth, contentBayHeight;

      innerCutoutWidth = safeCutoutWidth;
      innerCutoutHeight = safeCutoutHeight;

      if (panelPlacement === 'left') {
        contentBayWidth = Math.min(DEFAULT_BAY_WIDTH, Math.max(MIN_BAY_WIDTH, safeCutoutLeft - MARGIN_LEFT - GAP_BETWEEN));
        cardLeft = Math.max(8, safeCutoutLeft - contentBayWidth - GAP_BETWEEN - MARGIN_LEFT);
        cardTop = Math.max(8, safeCutoutTop - MARGIN_TOP);
        contentBayLeft = MARGIN_LEFT;
        contentBayTop = safeCutoutTop - cardTop;
        contentBayHeight = Math.max(innerCutoutHeight, 480);
        innerCutoutLeft = contentBayLeft + contentBayWidth + GAP_BETWEEN;
        innerCutoutTop = safeCutoutTop - cardTop;
        cardWidth = Math.min(vW - cardLeft - 8, innerCutoutLeft + innerCutoutWidth + MARGIN_RIGHT);
        cardHeight = Math.min(vH - cardTop - 8, Math.max(innerCutoutTop + innerCutoutHeight + MARGIN_BOTTOM, contentBayTop + contentBayHeight + MARGIN_BOTTOM));
      } else if (panelPlacement === 'bottom') {
        cardLeft = Math.max(8, safeCutoutLeft - MARGIN_LEFT);
        cardTop = Math.max(8, safeCutoutTop - MARGIN_TOP);
        innerCutoutLeft = safeCutoutLeft - cardLeft;
        innerCutoutTop = safeCutoutTop - cardTop;
        contentBayLeft = innerCutoutLeft;
        contentBayTop = innerCutoutTop + innerCutoutHeight + GAP_BETWEEN;
        contentBayWidth = Math.max(innerCutoutWidth, 380);
        contentBayHeight = Math.min(320, vH - cardTop - contentBayTop - MARGIN_BOTTOM);
        cardWidth = Math.min(vW - cardLeft - 8, Math.max(innerCutoutLeft + innerCutoutWidth, contentBayLeft + contentBayWidth) + MARGIN_RIGHT);
        cardHeight = Math.min(vH - cardTop - 8, contentBayTop + contentBayHeight + MARGIN_BOTTOM);
      } else if (panelPlacement === 'top') {
        cardLeft = Math.max(8, safeCutoutLeft - MARGIN_LEFT);
        contentBayHeight = Math.min(260, Math.max(160, safeCutoutTop - MARGIN_TOP - GAP_BETWEEN));
        cardTop = Math.max(8, safeCutoutTop - contentBayHeight - GAP_BETWEEN - MARGIN_TOP);
        contentBayLeft = MARGIN_LEFT;
        contentBayTop = MARGIN_TOP;
        contentBayWidth = Math.max(innerCutoutWidth, 380);
        innerCutoutLeft = MARGIN_LEFT;
        innerCutoutTop = contentBayTop + contentBayHeight + GAP_BETWEEN;
        cardWidth = Math.min(vW - cardLeft - 8, Math.max(innerCutoutLeft + innerCutoutWidth, contentBayLeft + contentBayWidth) + MARGIN_RIGHT);
        cardHeight = Math.min(vH - cardTop - 8, innerCutoutTop + innerCutoutHeight + MARGIN_BOTTOM);
      } else {
        // Default: 'right' placement
        cardLeft = Math.max(8, safeCutoutLeft - MARGIN_LEFT);
        cardTop = Math.max(8, safeCutoutTop - MARGIN_TOP);
        innerCutoutLeft = safeCutoutLeft - cardLeft;
        innerCutoutTop = safeCutoutTop - cardTop;

        const spaceRight = vW - (safeCutoutLeft + safeCutoutWidth + GAP_BETWEEN + MARGIN_RIGHT);
        contentBayWidth = DEFAULT_BAY_WIDTH;
        if (spaceRight < DEFAULT_BAY_WIDTH) {
          if (spaceRight >= MIN_BAY_WIDTH) {
            contentBayWidth = spaceRight;
          } else {
            cardLeft = 8;
            innerCutoutLeft = safeCutoutLeft - cardLeft;
            const remaining = vW - (safeCutoutLeft + safeCutoutWidth + GAP_BETWEEN + MARGIN_RIGHT + 8);
            contentBayWidth = Math.max(MIN_BAY_WIDTH, Math.min(DEFAULT_BAY_WIDTH, remaining));
          }
        }

        contentBayLeft = innerCutoutLeft + innerCutoutWidth + GAP_BETWEEN;
        contentBayTop = innerCutoutTop;
        contentBayHeight = Math.max(innerCutoutHeight, 480);

        cardWidth = Math.min(vW - cardLeft - 8, contentBayLeft + contentBayWidth + MARGIN_RIGHT);
        cardHeight = Math.min(
          vH - cardTop - 8,
          Math.max(innerCutoutTop + innerCutoutHeight + MARGIN_BOTTOM, contentBayTop + contentBayHeight + MARGIN_BOTTOM)
        );
      }

      // Hole-punch polygon (outer CW, inner CCW)
      const cL = Math.round(innerCutoutLeft);
      const cT = Math.round(innerCutoutTop);
      const cR = Math.round(innerCutoutLeft + innerCutoutWidth);
      const cB = Math.round(innerCutoutTop + innerCutoutHeight);

      let clipPath;
      if (customPolygonPts && customPolygonPts.length >= 4) {
        const innerPolyString = customPolygonPts
          .map(([x, y]) => `${Math.round(x - cardLeft)}px ${Math.round(y - cardTop)}px`)
          .join(', ');
        const firstPt = `${Math.round(customPolygonPts[0][0] - cardLeft)}px ${Math.round(customPolygonPts[0][1] - cardTop)}px`;
        clipPath = `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${innerPolyString}, ${firstPt})`;
      } else {
        clipPath = `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${cL}px ${cT}px, ${cL}px ${cB}px, ${cR}px ${cB}px, ${cR}px ${cT}px, ${cL}px ${cT}px)`;
      }

      return {
        cardTop,
        cardLeft,
        cardWidth,
        cardHeight,
        innerCutoutLeft,
        innerCutoutTop,
        innerCutoutWidth,
        innerCutoutHeight,
        contentBayLeft,
        contentBayTop,
        contentBayWidth,
        contentBayHeight,
        clipPath,
        panelPlacement
      };
    }

    function extractQuestionSnippet() {
      // Use the same robust detector so snippet always matches the framed question
      const qEl = currentTargetQuestionEl || getQuestionTargetElement();
      if (qEl) {
        const text = (qEl.innerText || qEl.textContent || '').trim();
        if (text.length > 10) {
          return text.length > 300 ? text.slice(0, 297) + '...' : text;
        }
      }

      // Secondary: scan using the same SABIS-aware selectors
      const sabisSelectors = [
        '.divQuestion', '[id^="divQuestion"]:not(#divQuestions)',
        '.QuestionText', '.question-wrapper', '.quiz-question',
        '.question-container', '.question-card', '.question-item'
      ];
      const vH = window.innerHeight || document.documentElement.clientHeight;
      const vW = window.innerWidth  || document.documentElement.clientWidth;

      for (const sel of sabisSelectors) {
        let nodes;
        try { nodes = document.querySelectorAll(sel); } catch (_) { continue; }
        for (const el of nodes) {
          if (el.closest('#academic-solver-root')) continue;
          const r = el.getBoundingClientRect();
          if (r.width > 60 && r.height > 30 && r.bottom > 10 && r.top < vH - 10) {
            const text = (el.innerText || '').trim();
            if (text.length > 10) {
              return text.length > 300 ? text.slice(0, 297) + '...' : text;
            }
          }
        }
      }

      // Tertiary: user's typed prompt
      const rawPrompt = promptInput ? promptInput.value.trim() : '';
      if (rawPrompt) return rawPrompt;

      const title = (document.title || '').trim();
      return title ? `Question on: ${title}` : 'Captured Academic Question';
    }

    function updateCutoutPosition() {
      if (!studyBubbleContainer) return;

      // Re-detect active question element dynamically on every update — handles SABIS question navigation
      const liveEl = currentTargetQuestionEl && document.contains(currentTargetQuestionEl)
        ? currentTargetQuestionEl
        : getQuestionTargetElement();
      if (liveEl && liveEl !== currentTargetQuestionEl) {
        currentTargetQuestionEl = liveEl;
        if (typeof window !== 'undefined') window.currentTargetQuestionEl = liveEl;
      }

      const cutout = calculateQuestionCutout(currentTargetQuestionEl);
      const layout = calculateEncompassingLayout(cutout, currentStudyLayoutData);

      const card = studyBubbleContainer.querySelector('#study-encompassing-card');
      if (card) {
        card.style.top = `${layout.cardTop}px`;
        card.style.left = `${layout.cardLeft}px`;
        card.style.width = `${layout.cardWidth}px`;
        card.style.height = `${layout.cardHeight}px`;
      }

      const glassBg = studyBubbleContainer.querySelector('#study-encompassing-glass-bg');
      if (glassBg) {
        glassBg.style.clipPath = layout.clipPath;
      }

      const frameEl = studyBubbleContainer.querySelector('#study-cutout-frame');
      if (frameEl) {
        frameEl.style.left = `${layout.innerCutoutLeft}px`;
        frameEl.style.top = `${layout.innerCutoutTop}px`;
        frameEl.style.width = `${layout.innerCutoutWidth}px`;
        frameEl.style.height = `${layout.innerCutoutHeight}px`;
      }

      const contentBay = studyBubbleContainer.querySelector('#study-content-bay');
      if (contentBay) {
        contentBay.style.left = `${layout.contentBayLeft}px`;
        contentBay.style.top = `${layout.contentBayTop}px`;
        contentBay.style.width = `${layout.contentBayWidth}px`;
        contentBay.style.maxHeight = `${layout.contentBayHeight}px`;
      }

      if (currentStudyLayoutData && Array.isArray(currentStudyLayoutData.question_polygon_normalized) && currentStudyLayoutData.question_polygon_normalized.length > 0) {
        applyDynamicPolygonCutout(currentStudyLayoutData.question_polygon_normalized);
      }
    }

    function mountStudyBubble(questionSnippet, qRect, layoutData = null) {
      if (!shadow) return;
      unmountStudyLoadingPill();

      currentStudyLayoutData = layoutData || null;
      currentTargetQuestionEl = (qRect && qRect.element) ? qRect.element : getQuestionTargetElement();
      if (typeof window !== 'undefined') window.currentTargetQuestionEl = currentTargetQuestionEl;
      const cutout = calculateQuestionCutout(currentTargetQuestionEl);
      const layout = calculateEncompassingLayout(cutout, currentStudyLayoutData);

      if (!studyBubbleContainer) {
        studyBubbleContainer = document.createElement('div');
        studyBubbleContainer.id = 'sabis-study-bubble-container';
        studyBubbleContainer.className = 'sabis-study-bubble';
        shadow.appendChild(studyBubbleContainer);
      }

      studyBubbleContainer.style.display = isUIVisible ? 'block' : 'none';

      studyBubbleContainer.innerHTML = `
        <!-- Single Encompassing Liquid Glass Card -->
        <div class="study-encompassing-card" id="study-encompassing-card"
             style="top: ${layout.cardTop}px; left: ${layout.cardLeft}px; width: ${layout.cardWidth}px; height: ${layout.cardHeight}px;">

          <!-- Liquid Glass Background with Central Hole-Punch Cutout Polygon -->
          <div class="study-encompassing-glass-bg" id="study-encompassing-glass-bg" style="clip-path: ${layout.clipPath};"></div>

          <!-- Central Question Cutout Window Framing & Header Tag -->
          <div class="study-cutout-frame" id="study-cutout-frame"
               style="left: ${layout.innerCutoutLeft}px; top: ${layout.innerCutoutTop}px; width: ${layout.innerCutoutWidth}px; height: ${layout.innerCutoutHeight}px;">
            <div class="study-cutout-tag">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <span>ACTIVE QUESTION</span>
            </div>
          </div>

          <!-- Top-Right Close Button -->
          <button type="button" class="study-bubble-close-btn" title="Close Study Mode">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          <!-- Right-Hand Content Bay directly inside the encompassing liquid glass card -->
          <div class="study-content-bay" id="study-content-bay"
               style="left: ${layout.contentBayLeft}px; top: ${layout.contentBayTop}px; width: ${layout.contentBayWidth}px; max-height: ${layout.contentBayHeight}px;">

            <!-- 1. ANSWER CARD -->
            <div class="study-answer-card">
              <span class="study-section-label">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Answer Summary
              </span>
              <div class="study-answer-text" id="study-answer-text"></div>
            </div>

            <!-- Divider -->
            <div class="study-divider"></div>

            <!-- 2. EXPLANATION BLOCK -->
            <div class="study-explanation-card">
              <span class="study-section-label">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                Explanation
              </span>
              <div class="study-explanation-text" id="study-explanation-text"></div>
            </div>

            <!-- 3. FOLLOW-UP INPUT PILL -->
            <div class="study-followup-box">
              <div class="study-followup-bar">
                <input type="text" class="study-prompt-input" id="study-prompt-input"
                  placeholder="Ask about explanation..."
                  autocomplete="off" autocorrect="off" spellcheck="false"
                  data-lpignore="true" aria-autocomplete="none">
                <button type="button" class="study-send-btn" id="study-send-btn" title="Send">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </div>

            <!-- 4. MULTIMEDIA DIAGRAM / VISUAL BREAKDOWN PANEL -->
            <div class="study-diagram-box diagram-container" id="study-diagram-box">
              <div class="study-diagram-header">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="3" y1="9" x2="21" y2="9"></line>
                  <line x1="9" y1="21" x2="9" y2="9"></line>
                </svg>
                <span>Visual Diagrams</span>
              </div>
              <div class="diagram-container" id="diagram-render-panel">
                <pre class="study-diagram-content" id="study-diagram-content"></pre>
              </div>
            </div>

          </div><!-- /study-content-bay -->
        </div><!-- /study-encompassing-card -->
      `;

      // Top-Right Close Button
      const closeBtn = studyBubbleContainer.querySelector('.study-bubble-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          unmountStudyBubble();
        });
      }

      // Interactive Follow-Up Input Bar
      const followInput = studyBubbleContainer.querySelector('#study-prompt-input');
      const sendBtn = studyBubbleContainer.querySelector('#study-send-btn');

      const handleSendFollowUp = () => {
        const query = followInput ? followInput.value.trim() : '';
        if (!query) return;
        executeStudyFollowUp(query);
      };

      if (followInput) {
        followInput.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSendFollowUp();
          }
        });
        followInput.addEventListener('keyup', (e) => e.stopPropagation());
        followInput.addEventListener('keypress', (e) => e.stopPropagation());
      }

      if (sendBtn) {
        sendBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          handleSendFollowUp();
        });
      }

      window.addEventListener('scroll', updateCutoutPosition, { passive: true });
      window.addEventListener('resize', updateCutoutPosition, { passive: true });

      // MutationObserver: detect SABIS question navigation / DOM changes and re-fit the cutout
      if (typeof MutationObserver !== 'undefined') {
        const quizRoot = document.getElementById('divQuestions') || document.body;
        const _studyMutationObserver = new MutationObserver(() => {
          // Debounce to avoid thrashing on rapid DOM changes
          if (_studyMutationObserver._rafId) cancelAnimationFrame(_studyMutationObserver._rafId);
          _studyMutationObserver._rafId = requestAnimationFrame(() => {
            if (studyBubbleContainer) updateCutoutPosition();
          });
        });
        _studyMutationObserver.observe(quizRoot, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'hidden']
        });
        // Store reference on container so unmount can disconnect it
        studyBubbleContainer._mutationObserver = _studyMutationObserver;
      }

      if (currentStudyLayoutData && Array.isArray(currentStudyLayoutData.question_polygon_normalized) && currentStudyLayoutData.question_polygon_normalized.length > 0) {
        applyDynamicPolygonCutout(currentStudyLayoutData.question_polygon_normalized);
      }
    }

    function renderStudyThinkingState(questionSnippet = '') {
      if (!studyBubbleContainer) return;
      const aText = studyBubbleContainer.querySelector('#study-answer-text');
      const eText = studyBubbleContainer.querySelector('#study-explanation-text');
      const dBox = studyBubbleContainer.querySelector('#study-diagram-box');

      if (aText) {
        aText.innerHTML = `<div class="study-skeleton-line" style="width: 55%; height: 16px;"></div>`;
      }

      if (eText) {
        eText.innerHTML = `
          <div class="study-thinking-badge">Thinking deeply behind the scenes...</div>
          <div class="study-skeleton-line" style="width: 90%;"></div>
          <div class="study-skeleton-line" style="width: 82%;"></div>
        `;
      }

      if (dBox) {
        dBox.classList.remove('is-expanded');
        dBox.style.setProperty('display', 'none', 'important');
        dBox.style.opacity = '0';
        dBox.style.maxHeight = '0';
      }
    }

    function renderStudySolution(data, questionSnippet = '') {
      if (!studyBubbleContainer) return;
      const aText    = studyBubbleContainer.querySelector('#study-answer-text');
      const eText    = studyBubbleContainer.querySelector('#study-explanation-text');
      const dBox     = studyBubbleContainer.querySelector('#study-diagram-box');
      const dPanel   = studyBubbleContainer.querySelector('#diagram-render-panel');
      const dContent = studyBubbleContainer.querySelector('#study-diagram-content');

      if (aText) {
        aText.innerHTML = `<strong>${escapeHtml(data.answer || 'Completed')}</strong>`;
      }

      if (eText) {
        eText.textContent = data.explanation || 'Solution calculated directly from screenshot context.';
      }

      if (dBox && dPanel) {
        const diagram = (data.diagram && typeof data.diagram === 'string') ? data.diagram.trim() : '';
        if (diagram) {
          dBox.classList.add('is-expanded');
          dBox.style.setProperty('display', 'block', 'important');
          dBox.style.opacity = '1';
          dBox.style.maxHeight = '420px';

          // Detect payload type: base64 image, URL, HTML <img>, or markdown image syntax
          const isBase64Image = /^data:image\//i.test(diagram);
          const isUrlImage    = /^https?:\/\/.+\.(png|jpg|jpeg|gif|svg|webp)/i.test(diagram);
          const isHtmlImg     = /<img\s/i.test(diagram);
          const isMdImage     = /^!\[.*?\]\((.+?)\)/.test(diagram);

          if (isBase64Image || isUrlImage) {
            dPanel.innerHTML = `<img src="${escapeHtml(diagram)}" alt="Visual Diagram" class="diagram-fluid-img" />`;
            if (dContent) dContent.textContent = '';
          } else if (isHtmlImg) {
            // Safely set only <img> tags by stripping anything other than img
            const tmpDiv = document.createElement('div');
            tmpDiv.innerHTML = diagram;
            const imgEl = tmpDiv.querySelector('img');
            if (imgEl) {
              imgEl.className = 'diagram-fluid-img';
              imgEl.alt = imgEl.alt || 'Visual Diagram';
              dPanel.innerHTML = '';
              dPanel.appendChild(imgEl);
              if (dContent) dContent.textContent = '';
            } else {
              if (dContent) dContent.textContent = diagram;
            }
          } else if (isMdImage) {
            const mdMatch = diagram.match(/^!\[.*?\]\((.+?)\)/);
            const imgSrc = mdMatch ? mdMatch[1] : '';
            if (imgSrc) {
              dPanel.innerHTML = `<img src="${escapeHtml(imgSrc)}" alt="Visual Diagram" class="diagram-fluid-img" />`;
              if (dContent) dContent.textContent = '';
            } else {
              if (dContent) dContent.textContent = diagram;
            }
          } else {
            // Plain text / ASCII / Markdown table — render in <pre>
            if (dContent) dContent.textContent = diagram;
            dPanel.innerHTML = '';
            dPanel.appendChild(dContent);
          }
        } else {
          dBox.classList.remove('is-expanded');
          dBox.style.setProperty('display', 'none', 'important');
          dBox.style.opacity = '0';
          dBox.style.maxHeight = '0';
        }
      }
    }

    function renderStudyError(errorMsg) {
      if (!studyBubbleContainer) return;
      const aText = studyBubbleContainer.querySelector('#study-answer-text');
      const eText = studyBubbleContainer.querySelector('#study-explanation-text');
      if (aText) aText.innerHTML = `<span style="color: #ff3b30; font-weight: 700;">Unable to solve</span>`;
      if (eText) eText.textContent = errorMsg || 'An error occurred during verification.';
    }

    function executeStudyFollowUp(query) {
      if (!studyBubbleContainer || !query) return;
      const followInput = studyBubbleContainer.querySelector('#study-prompt-input');
      const eText = studyBubbleContainer.querySelector('#study-explanation-text');

      if (followInput) followInput.value = '';

      if (eText) {
        eText.innerHTML = `
          <div class="study-thinking-badge">Consulting AI tutor on: "${escapeHtml(query)}"...</div>
          <div class="study-skeleton-line" style="width: 90%;"></div>
          <div class="study-skeleton-line" style="width: 75%;"></div>
        `;
      }

      try {
        chrome.runtime.sendMessage({
          action: 'STUDY_FOLLOWUP',
          followUpQuery: query,
          threadHistory: studyThreadHistory
        }, (response) => {
          let lastErr = null;
          try { lastErr = chrome.runtime.lastError; } catch (_) {}

          if (lastErr || !response || !response.success) {
            const err = lastErr?.message || response?.error || 'Failed to answer follow-up question.';
            renderStudyError(err);
            return;
          }

          studyThreadHistory.push({ role: 'user', content: query });
          studyThreadHistory.push({
            role: 'model',
            content: response.rawOutput || JSON.stringify({
              answer: response.answer,
              explanation: response.explanation,
              diagram: response.diagram
            })
          });

          renderStudySolution(response);
        });
      } catch (err) {
        renderStudyError(err?.message || String(err));
      }
    }

    function unmountStudyBubble() {
      unmountStudyLoadingPill();
      window.removeEventListener('scroll', updateCutoutPosition);
      window.removeEventListener('resize', updateCutoutPosition);
      // Disconnect the MutationObserver watching for question DOM changes
      if (studyBubbleContainer && studyBubbleContainer._mutationObserver) {
        try { studyBubbleContainer._mutationObserver.disconnect(); } catch (_) {}
        studyBubbleContainer._mutationObserver = null;
      }
      if (studyBubbleContainer && studyBubbleContainer.parentNode) {
        studyBubbleContainer.parentNode.removeChild(studyBubbleContainer);
      }
      studyBubbleContainer = null;
      currentTargetQuestionEl = null;
      if (typeof window !== 'undefined') window.currentTargetQuestionEl = null;
      currentStudyLayoutData = null;
      studyThreadHistory = [];
    }

    // Capture & Solve
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

      const rawPrompt = promptInput ? promptInput.value.trim() : '';
      const pageTitle = (document.title || '').trim();

      // Webpage Context Augmentation
      const contextAugmentedPrompt = pageTitle
        ? (rawPrompt ? `[Context: ${pageTitle}] ${rawPrompt}` : `[Context: ${pageTitle}]`)
        : rawPrompt;

      // Client-Side Edge Pre-Processing: Heuristic Task Classifier (<1ms)
      const isComplex = isComplexTask(rawPrompt || pageTitle);
      const taskComplexity = isComplex ? 'HIGH_COMPLEXITY' : 'LIGHTWEIGHT';

      // Client-Side OCR & Browser Canvas Text Extractor (<5ms)
      const extractedVerifiedText = extractVerifiedTextFromDOMAndCanvas();

      // ── STUDY MODE EXECUTION (DUAL-PIPELINE AI VISION & MATH ENGINE) ──
      if (isStudyMode) {
        // Suppress standard plain text answer overlay
        if (answerContainer) {
          answerContainer.style.setProperty('display', 'none', 'important');
        }

        const qRect = getQuestionBoundingRect();
        const questionSnippet = extractQuestionSnippet();

        // 1. Immediately show Apple iOS 27 Liquid Glass loading capsule (<10ms)
        mountStudyLoadingPill('Analyzing question layout...');

        try {
          chrome.runtime.sendMessage({
            action: 'SOLVE_SCREEN',
            studyMode: true,
            customPrompt: contextAugmentedPrompt,
            rawPrompt: rawPrompt,
            pageTitle: pageTitle,
            taskComplexity: taskComplexity,
            extractedVerifiedText: extractedVerifiedText
          }, (response) => {
            isSolving = false;
            unmountStudyLoadingPill();

            let lastErr = null;
            try { lastErr = chrome.runtime.lastError; } catch (_) {}

            if (lastErr || !response || !response.success) {
              const err = lastErr?.message || response?.error || 'Failed to analyze screenshot.';
              mountStudyBubble(questionSnippet, qRect, null);
              renderStudyError(err);
              return;
            }

            // Save conversation thread memory
            studyThreadHistory = [
              { role: 'user', content: contextAugmentedPrompt || 'Solve question' },
              {
                role: 'model',
                content: response.rawOutput || JSON.stringify({
                  answer: response.answer,
                  explanation: response.explanation,
                  diagram: response.diagram
                })
              }
            ];

            // 2. Mount encompassing liquid glass card using AI Vision polygon & placement
            mountStudyBubble(questionSnippet, qRect, response.layoutData || null);
            if (response.layoutData && Array.isArray(response.layoutData.question_polygon_normalized) && response.layoutData.question_polygon_normalized.length > 0) {
              applyDynamicPolygonCutout(response.layoutData.question_polygon_normalized);
            }
            renderStudySolution(response, questionSnippet);
          });
        } catch (err) {
          isSolving = false;
          unmountStudyLoadingPill();
          mountStudyBubble(questionSnippet, qRect, null);
          renderStudyError(err?.message || String(err));
        }
        return;
      }

      // ── STANDARD SOLUTION EXECUTION (STUDY MODE OFF) ──
      unmountStudyBubble();
      if (answerContainer) {
        answerContainer.style.removeProperty('display');
      }

      currentAnswerText = 'Solving...';
      answerText.textContent = currentAnswerText;

      try {
        chrome.runtime.sendMessage({
          action: 'SOLVE_SCREEN',
          studyMode: false,
          customPrompt: contextAugmentedPrompt,
          rawPrompt: rawPrompt,
          pageTitle: pageTitle,
          taskComplexity: taskComplexity,
          extractedVerifiedText: extractedVerifiedText
        }, (response) => {
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
            if (response.fromCache) {
              console.log('[Cache Hit] Received instant 0ms cached answer');
            }
          }

          if (answerText) {
            answerText.textContent = formatAnswerForBar(currentAnswerText);
            updateAnswerBoundaryShift();
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
          updateAnswerBoundaryShift();
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

        if (changes.studyMode !== undefined) {
          isStudyMode = !!changes.studyMode.newValue;
          const studyToggle = shadow ? shadow.getElementById('inpage-enable-study-mode') : null;
          if (studyToggle) studyToggle.checked = isStudyMode;
          if (!isStudyMode) {
            unmountStudyBubble();
            if (answerContainer) answerContainer.style.removeProperty('display');
          }
        }

        // Live-update positions
        ['button', 'prompt', 'answer'].forEach(target => {
          const posKey = `${target}_position`;
          const altKey = `pos_${target}`;
          const isAns = (target === 'answer');
          if (changes[posKey] || changes[altKey] || (isAns && (changes.panelPosition || changes.panel_position))) {
            const val = changes[posKey]?.newValue ?? changes[altKey]?.newValue ?? (isAns ? (changes.panelPosition?.newValue ?? changes.panel_position?.newValue) : null);
            if (val) {
              const x = val.left ?? val.x;
              const y = val.top ?? val.y;
              if (x != null && y != null) {
                positions[target] = { x, y, top: y, left: x };
                applyTargetPosition(target, x, y);
                return;
              }
            }
            positions[target] = null;
            resetTargetPosition(target);
          }
        });
      });
    } catch (_) {}
  }

  function sanitizeAnswer(text) {
    if (!text) return '';
    return text
      .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/^Thought:[\s\S]*?(?=\n\n|\n[A-Z0-9]|$)/i, '')
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
      .join('\n');
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
      updateAnswerBoundaryShift();
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
