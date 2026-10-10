/**
 * SignSpeaks – Content Script
 *
 * Injected into Google Meet / Zoom pages.
 * Creates the floating overlay and orchestrates the Speech and Sign modules.
 */

(function () {
    'use strict';

    // ============================================================
    // State
    // ============================================================
    let extensionEnabled = false;
    let speechEnabled = false;
    let signEnabled = false;
    let speechModule = null;
    let signModule = null;
    let currentFontSize = 14; // px

    // ============================================================
    // Build overlay DOM
    // ============================================================
    function createOverlay() {
        if (document.getElementById('signspeaks-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'signspeaks-overlay';
        overlay.classList.add('hidden');

        overlay.innerHTML = `
      <div id="signspeaks-header">
        <span id="signspeaks-title">🤟 SignSpeaks</span>
        <div id="signspeaks-header-controls">
          <button id="signspeaks-btn-fontup" title="Increase text size">A+</button>
          <button id="signspeaks-btn-fontdown" title="Decrease text size">A−</button>
          <button id="signspeaks-btn-clear" title="Clear captions">✕</button>
        </div>
      </div>
      <div id="signspeaks-captions"></div>
      <div id="signspeaks-footer">
        <div class="indicators">
          <span><span class="indicator-dot speech-dot inactive" id="signspeaks-speech-dot"></span> Speech</span>
          <span><span class="indicator-dot sign-dot inactive" id="signspeaks-sign-dot"></span> Sign</span>
        </div>
        <span>SignSpeaks v1.0</span>
      </div>
    `;

        document.body.appendChild(overlay);

        // --- Button handlers ---
        document.getElementById('signspeaks-btn-clear').addEventListener('click', () => {
            document.getElementById('signspeaks-captions').innerHTML = '';
        });

        document.getElementById('signspeaks-btn-fontup').addEventListener('click', () => {
            currentFontSize = Math.min(currentFontSize + 2, 24);
            document.getElementById('signspeaks-captions').style.fontSize = currentFontSize + 'px';
        });

        document.getElementById('signspeaks-btn-fontdown').addEventListener('click', () => {
            currentFontSize = Math.max(currentFontSize - 2, 10);
            document.getElementById('signspeaks-captions').style.fontSize = currentFontSize + 'px';
        });

        // --- Make draggable ---
        makeDraggable(overlay, document.getElementById('signspeaks-header'));
    }

    // ============================================================
    // Draggable helper
    // ============================================================
    function makeDraggable(element, handle) {
        let startX, startY, initialX, initialY;

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startX = e.clientX;
            startY = e.clientY;
            const rect = element.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;

            function onMouseMove(ev) {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                element.style.left = initialX + dx + 'px';
                element.style.top = initialY + dy + 'px';
                element.style.right = 'auto'; // override default right positioning
            }

            function onMouseUp() {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    // ============================================================
    // Caption helpers
    // ============================================================

    /**
     * Add a caption entry to the overlay.
     * @param {'speech'|'sign'} type
     * @param {string} text
     */
    function addCaption(type, text) {
        const container = document.getElementById('signspeaks-captions');
        if (!container) return;

        const entry = document.createElement('div');
        entry.className = 'signspeaks-entry';

        const label = document.createElement('div');
        label.className = 'label ' + type;
        label.textContent = type === 'speech' ? '🎙 Speech' : '✋ Sign';

        const content = document.createElement('div');
        content.className = 'text';
        content.textContent = text;

        entry.appendChild(label);
        entry.appendChild(content);
        container.appendChild(entry);

        // Auto-scroll to bottom
        container.scrollTop = container.scrollHeight;

        // Keep at most 50 entries to prevent memory bloat
        while (container.children.length > 50) {
            container.removeChild(container.firstChild);
        }
    }

    /**
     * Update the last interim speech caption instead of appending.
     * @param {string} text
     */
    let lastInterimEntry = null;

    function updateInterimSpeech(text) {
        const container = document.getElementById('signspeaks-captions');
        if (!container) return;

        if (!lastInterimEntry) {
            lastInterimEntry = document.createElement('div');
            lastInterimEntry.className = 'signspeaks-entry';

            const label = document.createElement('div');
            label.className = 'label speech';
            label.textContent = '🎙 Speech';

            const content = document.createElement('div');
            content.className = 'text';

            lastInterimEntry.appendChild(label);
            lastInterimEntry.appendChild(content);
            container.appendChild(lastInterimEntry);
        }

        lastInterimEntry.querySelector('.text').textContent = text;
        container.scrollTop = container.scrollHeight;
    }

    function finalizeInterimSpeech(text) {
        if (lastInterimEntry) {
            lastInterimEntry.querySelector('.text').textContent = text;
            lastInterimEntry = null;
        } else {
            addCaption('speech', text);
        }
    }

    // ============================================================
    // Module management
    // ============================================================

    function startSpeech() {
        if (speechModule) return;

        if (!window.SignSpeaksSpeech) {
            console.warn('[SignSpeaks] Speech module not loaded.');
            return;
        }

        speechModule = new window.SignSpeaksSpeech(
            // onResult
            function (text, isFinal) {
                if (isFinal) {
                    finalizeInterimSpeech(text);
                } else {
                    updateInterimSpeech(text);
                }
            },
            // onError
            function (errMsg) {
                addCaption('speech', '⚠️ ' + errMsg);
            }
        );

        speechModule.start();
        setIndicator('speech', true);
    }

    function stopSpeech() {
        if (speechModule) {
            speechModule.stop();
            speechModule = null;
        }
        lastInterimEntry = null;
        setIndicator('speech', false);
    }

    function startSign() {
        if (signModule) return;

        if (!window.SignSpeaksMediaPipe) {
            console.warn('[SignSpeaks] MediaPipe module not loaded.');
            return;
        }

        // Track last displayed sign to avoid flooding duplicates
        let lastSignLabel = '';
        let lastSignTime = 0;

        signModule = new window.SignSpeaksMediaPipe(
            // onSign
            function (label) {
                const now = Date.now();
                // Debounce: same label within 2 seconds is ignored
                if (label === lastSignLabel && now - lastSignTime < 2000) return;
                lastSignLabel = label;
                lastSignTime = now;
                addCaption('sign', label);
            },
            // onError
            function (errMsg) {
                addCaption('sign', '⚠️ ' + errMsg);
            }
        );

        signModule.start();
        setIndicator('sign', true);
    }

    function stopSign() {
        if (signModule) {
            signModule.stop();
            signModule = null;
        }
        setIndicator('sign', false);
    }

    function setIndicator(type, active) {
        const dot = document.getElementById('signspeaks-' + type + '-dot');
        if (dot) {
            dot.classList.toggle('active', active);
            dot.classList.toggle('inactive', !active);
        }
    }

    // ============================================================
    // Show / Hide overlay
    // ============================================================
    function showOverlay() {
        const el = document.getElementById('signspeaks-overlay');
        if (el) el.classList.remove('hidden');
    }

    function hideOverlay() {
        const el = document.getElementById('signspeaks-overlay');
        if (el) el.classList.add('hidden');
    }

    // ============================================================
    // Message handling from popup
    // ============================================================
    chrome.runtime.onMessage.addListener((msg) => {
        switch (msg.type) {
            case 'TOGGLE_EXTENSION':
                extensionEnabled = msg.enabled;
                if (extensionEnabled) {
                    showOverlay();
                } else {
                    stopSpeech();
                    stopSign();
                    hideOverlay();
                    speechEnabled = false;
                    signEnabled = false;
                }
                break;

            case 'TOGGLE_SPEECH':
                speechEnabled = msg.enabled;
                if (speechEnabled && extensionEnabled) {
                    startSpeech();
                } else {
                    stopSpeech();
                }
                break;

            case 'TOGGLE_SIGN':
                signEnabled = msg.enabled;
                if (signEnabled && extensionEnabled) {
                    startSign();
                } else {
                    stopSign();
                }
                break;
        }
    });

    // ============================================================
    // Initialisation
    // ============================================================
    createOverlay();

    // Restore state from storage in case the page was refreshed
    chrome.storage?.local?.get(['enabled', 'speech', 'sign'], (data) => {
        if (data.enabled) {
            extensionEnabled = true;
            showOverlay();
            if (data.speech) {
                speechEnabled = true;
                startSpeech();
            }
            if (data.sign) {
                signEnabled = true;
                startSign();
            }
        }
    });

    console.log('[SignSpeaks] Content script loaded ✓');
})();
