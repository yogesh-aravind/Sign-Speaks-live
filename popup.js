/**
 * SignSpeaks – Popup Script
 * Handles toggle states and sends messages to the active tab's content script.
 */

(function () {
  'use strict';

  // DOM elements
  const toggleExtension = document.getElementById('toggle-extension');
  const toggleSpeech    = document.getElementById('toggle-speech');
  const toggleSign      = document.getElementById('toggle-sign');
  const speechGroup     = document.getElementById('speech-group');
  const signGroup       = document.getElementById('sign-group');
  const statusDot       = document.querySelector('.status-dot');
  const statusText      = document.getElementById('status-text');

  // ---------- helpers ----------

  /** Send a message to the active tab's content script. */
  function sendToContent(message) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {
          // Content script may not be loaded yet – ignore silently
        });
      }
    });
  }

  /** Update the status indicator in the popup. */
  function updateStatus() {
    const isEnabled = toggleExtension.checked;
    statusDot.className = 'status-dot ' + (isEnabled ? 'on' : 'off');
    statusText.textContent = isEnabled ? 'Active' : 'Disabled';

    // Disable sub-toggles when extension is off
    speechGroup.classList.toggle('disabled', !isEnabled);
    signGroup.classList.toggle('disabled', !isEnabled);

    if (!isEnabled) {
      toggleSpeech.checked = false;
      toggleSign.checked   = false;
    }
  }

  // ---------- restore saved state ----------

  chrome.storage?.local?.get(['enabled', 'speech', 'sign'], (data) => {
    toggleExtension.checked = data.enabled ?? false;
    toggleSpeech.checked    = data.speech  ?? false;
    toggleSign.checked      = data.sign    ?? false;
    updateStatus();
  });

  // ---------- event listeners ----------

  toggleExtension.addEventListener('change', () => {
    const enabled = toggleExtension.checked;
    chrome.storage?.local?.set({ enabled });
    updateStatus();
    sendToContent({ type: 'TOGGLE_EXTENSION', enabled });

    if (!enabled) {
      chrome.storage?.local?.set({ speech: false, sign: false });
      sendToContent({ type: 'TOGGLE_SPEECH', enabled: false });
      sendToContent({ type: 'TOGGLE_SIGN',   enabled: false });
    }
  });

  toggleSpeech.addEventListener('change', () => {
    if (!toggleExtension.checked) return;
    const enabled = toggleSpeech.checked;
    chrome.storage?.local?.set({ speech: enabled });
    sendToContent({ type: 'TOGGLE_SPEECH', enabled });
  });

  toggleSign.addEventListener('change', () => {
    if (!toggleExtension.checked) return;
    const enabled = toggleSign.checked;
    chrome.storage?.local?.set({ sign: enabled });
    sendToContent({ type: 'TOGGLE_SIGN', enabled });
  });
})();
