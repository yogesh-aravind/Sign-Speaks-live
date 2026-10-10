/**
 * SignSpeaks – MediaPipe Hands Setup
 *
 * Loads MediaPipe Hands from CDN, accesses the user's webcam,
 * and feeds frames through the hand-detection pipeline.
 * Detected landmarks are passed to SignSpeaksClassifier.
 *
 * Exposes: window.SignSpeaksMediaPipe
 */

(function () {
    'use strict';

    /**
     * MediaPipeSetup
     * @param {function(string)} onSign   – callback(labelString) when a gesture is classified
     * @param {function(string)} onError  – callback(errorMessage)
     */
    function MediaPipeSetup(onSign, onError) {
        this._onSign = onSign || function () { };
        this._onError = onError || function () { };
        this._running = false;
        this._video = null;
        this._hands = null;
        this._camera = null;
        this._animationId = null;
        this._classifier = new (window.SignSpeaksClassifier || function () { })();
        this._scriptsLoaded = false;
    }

    /** Load MediaPipe scripts from CDN if not already loaded. */
    MediaPipeSetup.prototype._loadScripts = function () {
        if (this._scriptsLoaded) return Promise.resolve();

        const urls = [
            'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.min.js',
            'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.min.js'
        ];

        return urls.reduce((chain, url) => {
            return chain.then(() => new Promise((resolve, reject) => {
                // Skip if already loaded
                if (document.querySelector('script[src="' + url + '"]')) {
                    return resolve();
                }
                const s = document.createElement('script');
                s.src = url;
                s.onload = resolve;
                s.onerror = () => reject(new Error('Failed to load ' + url));
                document.head.appendChild(s);
            }));
        }, Promise.resolve()).then(() => {
            this._scriptsLoaded = true;
        });
    };

    /** Start the webcam and hand-detection pipeline. */
    MediaPipeSetup.prototype.start = function () {
        if (this._running) return;
        this._running = true;

        this._loadScripts()
            .then(() => this._initHands())
            .then(() => this._initCamera())
            .catch((err) => {
                this._onError(err.message || 'MediaPipe initialization failed');
                this._running = false;
            });
    };

    /** Initialise MediaPipe Hands. */
    MediaPipeSetup.prototype._initHands = function () {
        /* global Hands */
        if (typeof Hands === 'undefined') {
            throw new Error('MediaPipe Hands library not loaded.');
        }

        this._hands = new Hands({
            locateFile: (file) =>
                'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/' + file,
        });

        this._hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 0,   // lighter model for speed
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.5,
        });

        this._hands.onResults((results) => this._onResults(results));

        return this._hands.initialize();
    };

    /** Create a hidden video element and start the webcam via Camera helper or getUserMedia. */
    MediaPipeSetup.prototype._initCamera = function () {
        return new Promise((resolve, reject) => {
            // Create hidden video element
            this._video = document.createElement('video');
            this._video.setAttribute('playsinline', '');
            this._video.style.cssText =
                'position:fixed;bottom:0;right:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;';
            document.body.appendChild(this._video);

            /* global Camera */
            if (typeof Camera !== 'undefined') {
                // Use MediaPipe Camera utility
                this._camera = new Camera(this._video, {
                    onFrame: async () => {
                        if (this._running && this._hands) {
                            await this._hands.send({ image: this._video });
                        }
                    },
                    width: 320,
                    height: 240,
                });
                this._camera.start()
                    .then(resolve)
                    .catch((err) => reject(new Error('Camera access denied: ' + err.message)));
            } else {
                // Fallback: raw getUserMedia
                navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } })
                    .then((stream) => {
                        this._video.srcObject = stream;
                        this._video.onloadedmetadata = () => {
                            this._video.play();
                            this._processFrame();
                            resolve();
                        };
                    })
                    .catch((err) => reject(new Error('Camera access denied: ' + err.message)));
            }
        });
    };

    /** Fallback frame loop when Camera util is unavailable. */
    MediaPipeSetup.prototype._processFrame = function () {
        if (!this._running) return;
        if (this._hands && this._video && this._video.readyState >= 2) {
            this._hands.send({ image: this._video }).then(() => {
                this._animationId = requestAnimationFrame(() => this._processFrame());
            });
        } else {
            this._animationId = requestAnimationFrame(() => this._processFrame());
        }
    };

    /** Handle hand-detection results from MediaPipe. */
    MediaPipeSetup.prototype._onResults = function (results) {
        if (!this._running) return;
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0]; // first detected hand
            const prediction = this._classifier.classify(landmarks);
            if (prediction) {
                this._onSign(prediction.label);
            }
        }
    };

    /** Stop detection and release the webcam. */
    MediaPipeSetup.prototype.stop = function () {
        this._running = false;
        this._classifier.reset();

        if (this._animationId) {
            cancelAnimationFrame(this._animationId);
            this._animationId = null;
        }

        if (this._camera && typeof this._camera.stop === 'function') {
            this._camera.stop();
            this._camera = null;
        }

        if (this._video) {
            const stream = this._video.srcObject;
            if (stream) {
                stream.getTracks().forEach((t) => t.stop());
            }
            this._video.remove();
            this._video = null;
        }
    };

    /** @returns {boolean} */
    MediaPipeSetup.prototype.isRunning = function () {
        return this._running;
    };

    window.SignSpeaksMediaPipe = MediaPipeSetup;
})();
