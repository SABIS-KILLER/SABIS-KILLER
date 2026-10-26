document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('launcher-status');
  const openBtn = document.getElementById('btn-open-settings');

  function openInPageModal() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0];
      if (!activeTab || !activeTab.id) {
        if (statusEl) {
          statusEl.textContent = 'No active tab found.';
          statusEl.className = 'launcher-desc error';
        }
        return;
      }

      // Check if URL is protected (chrome://, edge://, file://, etc.)
      const url = activeTab.url || '';
      if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
        if (statusEl) {
          statusEl.textContent = 'Cannot run overlay on browser internal pages. Navigate to any website to configure settings.';
          statusEl.className = 'launcher-desc error';
        }
        return;
      }

      chrome.tabs.sendMessage(activeTab.id, { action: 'OPEN_SETTINGS_MODAL' }, (response) => {
        let err = null;
        try { err = chrome.runtime.lastError; } catch (_) {}

        if (err || !response) {
          // If content script was not injected yet, inject it dynamically
          chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['content.js']
          }).then(() => {
            setTimeout(() => {
              chrome.tabs.sendMessage(activeTab.id, { action: 'OPEN_SETTINGS_MODAL' }, () => {
                if (statusEl) {
                  statusEl.textContent = 'Settings overlay opened on page.';
                  statusEl.className = 'launcher-desc success';
                }
                setTimeout(() => window.close(), 250);
              });
            }, 100);
          }).catch((injectionErr) => {
            if (statusEl) {
              statusEl.textContent = 'Please refresh the webpage to load settings.';
              statusEl.className = 'launcher-desc error';
            }
          });
        } else {
          if (statusEl) {
            statusEl.textContent = 'Settings overlay opened on page.';
            statusEl.className = 'launcher-desc success';
          }
          setTimeout(() => window.close(), 250);
        }
      });
    });
  }

  if (openBtn) {
    openBtn.addEventListener('click', openInPageModal);
  }

  // Automatically attempt opening upon popup trigger
  openInPageModal();
});
