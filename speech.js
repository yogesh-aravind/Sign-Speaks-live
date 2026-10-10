/**
 * SignSpeaks – Speech-to-Text Module
 * Wraps the Web Speech API for continuous speech recognition.
 *
 * Exposes a global object: window.SignSpeaksSpeech
 */

(function () {
    'use strict';

    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        console.warn('[SignSpeaks] Web Speech API is not supported in this browser.');
    }

    /**
     * SpeechModule
     * @param {function(string, boolean)} onResult  – callback(text, isFinal)
     * @param {function(string)}          onError   – callback(errorMessage)
     */
    function SpeechModule(onResult, onError) {
        this._onResult = onResult || function () { };
        this._onError = onError || function () { };
        this._running = false;
        this._recognition = null;
    }

    SpeechModule.prototype.start = function () {
        if (this._running) return;
        if (!SpeechRecognition) {
            this._onError('Web Speech API not supported');
            return;
        }

        const rec = new SpeechRecognition();
        rec.continuous = true;    // keep listening until stopped
        rec.interimResults = true;    // show partial results
        rec.lang = 'en-US';

        rec.onresult = (event) => {
            // Iterate only over new results
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                const isFinal = event.results[i].isFinal;
                this._onResult(transcript, isFinal);
            }
        };

        rec.onerror = (event) => {
            // Map common error codes to friendly messages
            const messages = {
                'not-allowed': 'Microphone access denied. Please allow microphone permission.',
                'no-speech': 'No speech detected. Please try speaking again.',
                'audio-capture': 'No microphone found. Please connect a microphone.',
                'network': 'Network error during speech recognition.',
                'aborted': 'Speech recognition was aborted.',
            };
            const msg = messages[event.error] || 'Speech error: ' + event.error;
            this._onError(msg);

            // Auto-restart on non-fatal errors
            if (event.error === 'no-speech' || event.error === 'network') {
                this._restartAfterDelay();
            }
        };

        // When recognition ends (browser may stop it), restart if still flagged running
        rec.onend = () => {
            if (this._running) {
                this._restartAfterDelay();
            }
        };

        this._recognition = rec;
        this._running = true;

        try {
            rec.start();
        } catch (err) {
            this._onError('Failed to start speech recognition: ' + err.message);
            this._running = false;
        }
    };

    /** Stop speech recognition. */
    SpeechModule.prototype.stop = function () {
        this._running = false;
        if (this._recognition) {
            try { this._recognition.stop(); } catch (_) { /* ignore */ }
            this._recognition = null;
        }
        if (this._restartTimer) {
            clearTimeout(this._restartTimer);
            this._restartTimer = null;
        }
    };

    /** @returns {boolean} Whether recognition is currently running. */
    SpeechModule.prototype.isRunning = function () {
        return this._running;
    };

    /** Internal – restart with a small delay to avoid tight loops. */
    SpeechModule.prototype._restartAfterDelay = function () {
        if (!this._running) return;
        this._restartTimer = setTimeout(() => {
            if (this._running) {
                try {
                    this._recognition = null;
                    this.start();
                } catch (_) { /* ignore */ }
            }
        }, 300);
    };

    // Expose globally so content.js can use it
    window.SignSpeaksSpeech = SpeechModule;
})();
