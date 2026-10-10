/**
 * SignSpeaks – Sign Language Classifier (Rule-Based Mock)
 *
 * Uses simple heuristics on MediaPipe hand-landmark positions to classify
 * gestures into one of five labels:
 *   Hello, Yes, No, Thank You, Help
 *
 * This is a prototype / demo classifier. In production, replace the
 * classify() method with a real TensorFlow.js model inference.
 *
 * Landmark reference (MediaPipe Hands):
 *   0  = Wrist
 *   4  = Thumb tip
 *   8  = Index finger tip
 *   12 = Middle finger tip
 *   16 = Ring finger tip
 *   20 = Pinky tip
 *   5,9,13,17 = MCP joints (base of each finger)
 *
 * Exposes: window.SignSpeaksClassifier
 */

(function () {
    'use strict';

    const LABELS = ['Hello', 'Yes', 'No', 'Thank You', 'Help'];

    // Confidence threshold – below this, return null
    const CONFIDENCE_THRESHOLD = 0.55;

    function SignClassifier() {
        this.labels = LABELS;
        this._lastLabel = null;
        this._stableCount = 0;
        this._stableNeeded = 3; // frames before accepting a gesture
    }

    /**
     * Classify hand landmarks into a gesture label.
     * @param {Array<{x:number,y:number,z:number}>} landmarks – 21 landmarks
     * @returns {{ label: string, confidence: number } | null}
     */
    SignClassifier.prototype.classify = function (landmarks) {
        if (!landmarks || landmarks.length < 21) return null;

        // Pre-compute finger "extended" booleans
        const fingersUp = this._fingersExtended(landmarks);
        const thumbUp = fingersUp[0];
        const indexUp = fingersUp[1];
        const middleUp = fingersUp[2];
        const ringUp = fingersUp[3];
        const pinkyUp = fingersUp[4];

        const allUp = thumbUp && indexUp && middleUp && ringUp && pinkyUp;
        const allDown = !thumbUp && !indexUp && !middleUp && !ringUp && !pinkyUp;

        let label = null;
        let confidence = 0;

        // ----- HELLO: Open palm, all five fingers extended -----
        if (allUp) {
            label = 'Hello';
            confidence = 0.9;
        }
        // ----- YES: Only thumb up (thumbs-up gesture) -----
        else if (thumbUp && !indexUp && !middleUp && !ringUp && !pinkyUp) {
            label = 'Yes';
            confidence = 0.85;
        }
        // ----- NO: Only index finger extended, waving side to side (simplified: just index up) -----
        else if (!thumbUp && indexUp && !middleUp && !ringUp && !pinkyUp) {
            label = 'No';
            confidence = 0.8;
        }
        // ----- THANK YOU: Fingers together touching chin then move out – simplified: thumb + index + middle up -----
        else if (thumbUp && indexUp && middleUp && !ringUp && !pinkyUp) {
            label = 'Thank You';
            confidence = 0.75;
        }
        // ----- HELP: Fist on open palm – simplified: all fingers down (fist) -----
        else if (allDown) {
            label = 'Help';
            confidence = 0.7;
        }

        if (!label || confidence < CONFIDENCE_THRESHOLD) return null;

        // Stability filter – same label must persist for N frames
        if (label === this._lastLabel) {
            this._stableCount++;
        } else {
            this._lastLabel = label;
            this._stableCount = 1;
        }

        if (this._stableCount >= this._stableNeeded) {
            return { label, confidence };
        }

        return null; // not stable yet
    };

    /**
     * Determine which fingers are extended based on landmark positions.
     * @returns {boolean[]} [thumb, index, middle, ring, pinky]
     */
    SignClassifier.prototype._fingersExtended = function (lm) {
        // Thumb: compare tip (4) x to IP joint (3) x, accounting for hand orientation
        const handIsRight = lm[17].x < lm[5].x; // rough left vs right hand
        const thumbExtended = handIsRight
            ? lm[4].x < lm[3].x
            : lm[4].x > lm[3].x;

        // Other fingers: tip y < PIP y means extended (MediaPipe y increases downward in image coords)
        const indexExtended = lm[8].y < lm[6].y;
        const middleExtended = lm[12].y < lm[10].y;
        const ringExtended = lm[16].y < lm[14].y;
        const pinkyExtended = lm[20].y < lm[18].y;

        return [thumbExtended, indexExtended, middleExtended, ringExtended, pinkyExtended];
    };

    /**
     * Reset the stability counter (useful when restarting detection).
     */
    SignClassifier.prototype.reset = function () {
        this._lastLabel = null;
        this._stableCount = 0;
    };

    window.SignSpeaksClassifier = SignClassifier;
})();
