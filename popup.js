/**
 * SABIS KILLER - Popup Controller (v2.1)
 * Multi-provider AI configuration with single Auto-Dynamic Model Picker,
 * Apple iOS 27 Liquid Glass optical stack, and pure black floating answer defaults.
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  let currentActiveProvider = 'gemini';
  let saveToastTimer = null;
  let saveDebounceTimer = null;

  const PROVIDERS = {
    gemini: {
      name: 'Google AI Studio',
      keyInputId: 'apiKey-gemini',
      modelSelectId: 'google-models',
      cardId: 'card-gemini',
      storageKey: 'GEMINI_API_KEY',
      altKey: 'geminiApiKey',
      modelKey: 'gemini_model',
      altModelKey: 'geminiModel',
      defaultModel: 'auto_dynamic'
    }
  };

  // ── iOS 27 Liquid Glass Refraction Variables ──
  function applyGlassRefraction(value) {
    const val = Math.max(0, Math.min(100, parseInt(value, 10) || 0));
    const t = val / 100;
    const root = document.documentElement;

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

    root.style.setProperty('--glass-opacity', glassOpacity);
    root.style.setProperty('--glass-card-opacity', cardOpacity);
    root.style.setProperty('--glass-input-opacity', inputOpacity);
    root.style.setProperty('--glass-blur', glassBlur);
    root.style.setProperty('--glass-saturate', glassSaturate);
    root.style.setProperty('--glass-refraction', glassRefraction);
    root.style.setProperty('--glass-border-alpha', borderAlpha);
    root.style.setProperty('--glass-inset-alpha', insetAlpha);
    root.style.setProperty('--glass-shadow-alpha', shadowAlpha);
  }

  // ── Toast Notification ──
  function showToast(msg = 'Saved') {
    const toast = document.getElementById('save-toast');
    const toastText = document.getElementById('save-toast-text');
    if (!toast) return;
    if (toastText) toastText.textContent = msg;
    toast.classList.add('show');
    clearTimeout(saveToastTimer);
    saveToastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 1800);
  }

  // ── Provider Navigation & Status ──
  function updateStatusBadge() {
    const statusBadge = document.getElementById('status-badge');
    const statusText = document.getElementById('status-text');
    if (!statusBadge || !statusText) return;

    const conf = PROVIDERS[currentActiveProvider];
    if (!conf) return;

    const keyInput = document.getElementById(conf.keyInputId);
    const hasKey = keyInput && keyInput.value.trim().length > 0;

    if (hasKey) {
      statusBadge.className = 'status-badge status-ready';
      statusText.textContent = 'Ready';
    } else {
      statusBadge.className = 'status-badge status-missing';
      statusText.textContent = 'No Key';
    }
  }

  function updateProviderTabDots() {
    Object.keys(PROVIDERS).forEach(provKey => {
      const conf = PROVIDERS[provKey];
      const keyInput = document.getElementById(conf.keyInputId);
      const dot = document.getElementById(conf.tabDotId);
      if (dot && keyInput) {
        if (keyInput.value.trim().length > 0) {
          dot.classList.add('configured');
        } else {
          dot.classList.remove('configured');
        }
      }
    });
  }

  function switchProvider(providerKey) {
    if (!PROVIDERS[providerKey]) return;
    currentActiveProvider = providerKey;

    document.querySelectorAll('.segmented-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-provider') === providerKey);
    });

    document.querySelectorAll('.provider-card').forEach(card => {
      card.classList.toggle('active', card.id === PROVIDERS[providerKey].cardId);
    });

    updateStatusBadge();
    autoSave(false);
  }

  // ── Save & Broadcast Settings ──
  function getFormData() {
    const data = {
      ai_provider: currentActiveProvider
    };

    Object.keys(PROVIDERS).forEach(prov => {
      const conf = PROVIDERS[prov];
      const keyEl = document.getElementById(conf.keyInputId);
      const modelEl = document.getElementById(conf.modelSelectId);

      const keyVal = keyEl ? keyEl.value.trim() : '';
      const modelVal = modelEl ? modelEl.value : conf.defaultModel;

      data[conf.storageKey] = keyVal;
      if (conf.altKey) data[conf.altKey] = keyVal;
      data[conf.modelKey] = modelVal;
      if (conf.altModelKey) data[conf.altModelKey] = modelVal;
    });

    const glassSlider = document.getElementById('glass-refraction-slider');
    const promptToggle = document.getElementById('enable-prompt-input');
    const ansColorHex = document.getElementById('answer-color-hex');
    const ansSizeSlider = document.getElementById('answer-font-size');
    const btnColorHex = document.getElementById('button-color-hex');
    const btnSizeSlider = document.getElementById('button-size');
    const promptColorHex = document.getElementById('prompt-color-hex');
    const promptWidthSlider = document.getElementById('prompt-width');

    data.glass_refraction = glassSlider ? parseInt(glassSlider.value, 10) : 70;
    data.enable_prompt_input = promptToggle ? promptToggle.checked : true;
    data.answer_text_color = ansColorHex ? ansColorHex.value.trim() : '#000000';
    data.answer_font_size = ansSizeSlider ? parseInt(ansSizeSlider.value, 10) : 14;
    data.button_bg_color = btnColorHex ? btnColorHex.value.trim() : '#FFFFFF';
    data.button_size = btnSizeSlider ? parseInt(btnSizeSlider.value, 10) : 30;
    data.prompt_bg_color = promptColorHex ? promptColorHex.value.trim() : '#FFFFFF';
    data.prompt_width = promptWidthSlider ? parseInt(promptWidthSlider.value, 10) : 180;

    return data;
  }

  function autoSave(showNotification = true) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      const data = getFormData();
      chrome.storage.local.set(data, () => {
        updateStatusBadge();
        updateProviderTabDots();
        if (showNotification) {
          showToast('Saved');
        }

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'UPDATE_SETTINGS',
              settings: data
            }, () => {
              try { void chrome.runtime.lastError; } catch (_) {}
            });
          }
        });
      });
    }, 180);
  }

  // ── Custom Liquid Glass Dropdown Logic (popup.html) ──
  function initCustomSelects() {
    const backdrop = document.getElementById('dropdown-backdrop');
    const wrappers = document.querySelectorAll('.custom-select-wrapper');
    wrappers.forEach(wrapper => {
      const trigger = wrapper.querySelector('.custom-select-trigger');
      const panel = wrapper.querySelector('.custom-options-panel');
      const hiddenInput = wrapper.querySelector('input[type="hidden"]');
      const options = wrapper.querySelectorAll('.custom-option');
      const label = wrapper.querySelector('.custom-select-label');

      if (!trigger || !panel || !hiddenInput) return;

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = wrapper.classList.contains('open');
        closeAllCustomSelects();
        if (!isOpen) {
          wrapper.classList.add('open');
          wrapper.closest('.card')?.classList.add('has-open-select');
          trigger.setAttribute('aria-expanded', 'true');
          if (backdrop) backdrop.classList.add('active');
        }
      });

      options.forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = opt.getAttribute('data-value');
          const optText = opt.querySelector('.custom-option-text')?.textContent || val;
          hiddenInput.value = val;
          if (label) label.textContent = optText;

          options.forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');

          wrapper.classList.remove('open');
          wrapper.closest('.card')?.classList.remove('has-open-select');
          trigger.setAttribute('aria-expanded', 'false');
          if (backdrop) backdrop.classList.remove('active');

          hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
          autoSave();
        });
      });
    });

    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllCustomSelects();
      });
    }
    document.addEventListener('click', () => closeAllCustomSelects());
  }

  function closeAllCustomSelects() {
    const backdrop = document.getElementById('dropdown-backdrop');
    if (backdrop) backdrop.classList.remove('active');
    document.querySelectorAll('.card.has-open-select').forEach(c => c.classList.remove('has-open-select'));
    document.querySelectorAll('.custom-select-wrapper.open').forEach(w => {
      w.classList.remove('open');
      const trigger = w.querySelector('.custom-select-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  function setCustomSelectValue(selectId, value) {
    const input = document.getElementById(selectId);
    if (!input) return;
    input.value = value;
    const wrapper = input.closest('.custom-select-wrapper');
    if (!wrapper) return;
    const label = wrapper.querySelector('.custom-select-label');
    const options = wrapper.querySelectorAll('.custom-option');
    let matched = false;
    options.forEach(opt => {
      if (opt.getAttribute('data-value') === value) {
        opt.classList.add('selected');
        if (label) label.textContent = opt.querySelector('.custom-option-text')?.textContent || value;
        matched = true;
      } else {
        opt.classList.remove('selected');
      }
    });
    if (!matched && options.length > 0) {
      options[0].classList.add('selected');
      input.value = options[0].getAttribute('data-value');
      if (label) label.textContent = options[0].querySelector('.custom-option-text')?.textContent || input.value;
    }
  }

  // ── Load Stored Settings ──
  function loadStoredSettings() {
    const keysToFetch = [
      'ai_provider', 'active_provider',
      'glass_refraction', 'enable_prompt_input',
      'answer_text_color', 'answer_font_size',
      'button_bg_color', 'button_size',
      'prompt_bg_color', 'prompt_width'
    ];

    Object.keys(PROVIDERS).forEach(prov => {
      const conf = PROVIDERS[prov];
      keysToFetch.push(conf.storageKey);
      if (conf.altKey) keysToFetch.push(conf.altKey);
      keysToFetch.push(conf.modelKey);
      if (conf.altModelKey) keysToFetch.push(conf.altModelKey);
    });

    chrome.storage.local.get(keysToFetch, (items) => {
      if (chrome.runtime.lastError || !items) return;

      const savedProvider = items.ai_provider || items.active_provider || 'gemini';
      currentActiveProvider = PROVIDERS[savedProvider] ? savedProvider : 'gemini';

      Object.keys(PROVIDERS).forEach(prov => {
        const conf = PROVIDERS[prov];
        const keyInput = document.getElementById(conf.keyInputId);
        const modelSelect = document.getElementById(conf.modelSelectId);

        const valKey = items[conf.storageKey] || (conf.altKey && items[conf.altKey]) || '';
        let valModel = items[conf.modelKey] || (conf.altModelKey && items[conf.altModelKey]) || conf.defaultModel;
        // Normalize any old auto option to auto_dynamic
        if (valModel?.startsWith('auto')) valModel = 'auto_dynamic';

        if (keyInput) keyInput.value = valKey;
        if (modelSelect) setCustomSelectValue(conf.modelSelectId, valModel);
      });

      const glassVal = items.glass_refraction != null ? items.glass_refraction : 70;
      const glassSlider = document.getElementById('glass-refraction-slider');
      const glassBadge = document.getElementById('glass-refraction-val');
      if (glassSlider) glassSlider.value = glassVal;
      if (glassBadge) glassBadge.textContent = `${glassVal}%`;
      applyGlassRefraction(glassVal);

      const promptToggle = document.getElementById('enable-prompt-input');
      if (promptToggle) promptToggle.checked = items.enable_prompt_input !== false;

      // Pure black default answer typography
      const ansColor = items.answer_text_color || '#000000';
      const ansSize = items.answer_font_size || 14;
      syncColor('answer-color-picker', 'answer-color-hex', ansColor);
      syncSlider('answer-font-size', 'answer-font-size-val', ansSize, 'px');

      const btnColor = items.button_bg_color || '#FFFFFF';
      const btnSize = items.button_size || 30;
      syncColor('button-color-picker', 'button-color-hex', btnColor);
      syncSlider('button-size', 'button-size-val', btnSize, 'px');

      const promptColor = items.prompt_bg_color || '#FFFFFF';
      const promptWidth = items.prompt_width || 180;
      syncColor('prompt-color-picker', 'prompt-color-hex', promptColor);
      syncSlider('prompt-width', 'prompt-width-val', promptWidth, 'px');

      switchProvider(currentActiveProvider);
      updateProviderTabDots();
    });
  }

  function syncColor(pickerId, hexId, value) {
    const picker = document.getElementById(pickerId);
    const hex = document.getElementById(hexId);
    if (picker) picker.value = value;
    if (hex) hex.value = value.toUpperCase();
  }

  function syncSlider(sliderId, badgeId, value, unit = '') {
    const slider = document.getElementById(sliderId);
    const badge = document.getElementById(badgeId);
    if (slider) slider.value = value;
    if (badge) badge.textContent = `${value}${unit}`;
  }

  function bindColorPair(pickerId, hexId) {
    const picker = document.getElementById(pickerId);
    const hex = document.getElementById(hexId);
    if (!picker || !hex) return;

    picker.addEventListener('input', () => {
      hex.value = picker.value.toUpperCase();
      autoSave();
    });

    hex.addEventListener('input', () => {
      let val = hex.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        picker.value = val;
        autoSave();
      }
    });

    hex.addEventListener('blur', () => {
      let val = hex.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (!/^#[0-9A-Fa-f]{6}$/.test(val)) {
        hex.value = picker.value.toUpperCase();
      } else {
        hex.value = val.toUpperCase();
        picker.value = val;
      }
    });
  }

  function bindSlider(sliderId, badgeId, unit = '') {
    const slider = document.getElementById(sliderId);
    const badge = document.getElementById(badgeId);
    if (!slider || !badge) return;

    slider.addEventListener('input', () => {
      badge.textContent = `${slider.value}${unit}`;
      autoSave();
    });
  }

  // ── Event Bindings ──
  document.querySelectorAll('.toggle-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
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

  const glassSlider = document.getElementById('glass-refraction-slider');
  const glassBadge = document.getElementById('glass-refraction-val');
  if (glassSlider && glassBadge) {
    glassSlider.addEventListener('input', () => {
      const val = glassSlider.value;
      glassBadge.textContent = `${val}%`;
      applyGlassRefraction(val);
      autoSave();
    });
  }

  const promptToggle = document.getElementById('enable-prompt-input');
  if (promptToggle) {
    promptToggle.addEventListener('change', () => autoSave());
  }

  bindColorPair('answer-color-picker', 'answer-color-hex');
  bindSlider('answer-font-size', 'answer-font-size-val', 'px');

  bindColorPair('button-color-picker', 'button-color-hex');
  bindSlider('button-size', 'button-size-val', 'px');

  bindColorPair('prompt-color-picker', 'prompt-color-hex');
  bindSlider('prompt-width', 'prompt-width-val', 'px');

  Object.keys(PROVIDERS).forEach(prov => {
    const conf = PROVIDERS[prov];
    const keyEl = document.getElementById(conf.keyInputId);
    const modelEl = document.getElementById(conf.modelSelectId);

    if (keyEl) {
      keyEl.addEventListener('input', () => autoSave());
      keyEl.addEventListener('change', () => autoSave());
    }
    if (modelEl) {
      modelEl.addEventListener('change', () => autoSave());
    }
  });

  document.querySelectorAll('.change-pos-btn, #change-position-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const target = btn.getAttribute('data-target') || 'panel';
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs && tabs[0];
        if (!activeTab || !activeTab.id) return;

        chrome.tabs.sendMessage(activeTab.id, {
          action: 'START_POSITION_PICKER',
          targetElement: target,
          target: target
        }, () => {
          try { void chrome.runtime.lastError; } catch (_) {}
          setTimeout(() => window.close(), 120);
        });
      });
    });
  });

  document.querySelectorAll('.reset-pos-btn, #reset-position-btn, .reset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const target = btn.getAttribute('data-target') || 'panel';
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs && tabs[0];
        if (activeTab && activeTab.id) {
          chrome.tabs.sendMessage(activeTab.id, {
            action: 'RESET_POSITION',
            targetElement: target,
            target: target
          }, () => {
            try { void chrome.runtime.lastError; } catch (_) {}
          });
        }
      });
      const keysToRemove = [`${target}_position`, `pos_${target}`];
      if (target === 'answer' || target === 'panel') {
        keysToRemove.push('panelPosition', 'panel_position');
      }
      chrome.storage.local.remove(keysToRemove, () => {
        showToast('Position Reset');
      });
    });
  });

  loadStoredSettings();
  initCustomSelects();
});
