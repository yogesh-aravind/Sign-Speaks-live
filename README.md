# 🤟 ISLens v3 — Indian Sign Language Translator
### Flask + MediaPipe · Letters + Words + Gestures · Fully Offline

---

## 📁 REQUIRED FOLDER STRUCTURE

```
ISLens/
├── app.py
├── requirements.txt
└── templates/
    └── index.html
```
⚠️ The `templates/` subfolder is REQUIRED by Flask.

---

## 🚀 SETUP (one time)

### Step 1 — Install Python packages
```bash
pip install flask opencv-python mediapipe numpy pyopenssl
```

### Step 2 — Run
```bash
python app.py
```

### Step 3 — Open browser
```
http://localhost:5000
```

---

## 🐛 BUGS FIXED IN v3

| Bug | Fix |
|-----|-----|
| Camera access denied | Fixed — proper getUserMedia with error messages |
| Stop button didn't work | Fixed — properly stops MediaPipe + camera tracks + srcObject |
| Old file path 404 | Fixed — correct Flask template routing |
| Only detected letters | Fixed — added 35+ ISL word/gesture recognition |
| Poor accuracy | Fixed — improved rules, angle checks, curl detection |
| No mode switching | Fixed — Letters / Words / Both mode toggle |

---

## 🔧 CAMERA PERMISSION FIX

Camera works automatically on `localhost` in Chrome/Edge.

If you still get "Camera denied":
1. Click the 🔒 **lock icon** in browser address bar
2. Set **Camera → Allow**
3. **Refresh** the page

For HTTPS (needed on some networks):
```bash
pip install pyopenssl
python app.py
# Then open: https://localhost:5000
# Accept the self-signed certificate warning
```

---

## 📋 DETECTION MODES

| Mode | What it detects |
|------|----------------|
| **LETTERS** | A–Z ISL fingerspelling |
| **WORDS** | 35+ common ISL words & gestures |
| **BOTH** | Words first (higher priority), falls back to letters |

---

## 🤟 RECOGNIZED WORDS & GESTURES (35+)

HELLO, YES, NO, THANK YOU, PLEASE, SORRY, HELP, GOOD, BAD,
ME/I, YOU, COME, GO, STOP, WATER, EAT/FOOD, DRINK, PAIN,
CALL, LOVE, NAME, UNDERSTAND, QUESTION, FAMILY, DOCTOR,
SCHOOL, HOME, MONEY, WORK, TIME, HOW MANY, INDIA,
TOGETHER, MEET, PROBLEM

---

## 🎬 GET ISL TEST VIDEOS

```bash
pip install yt-dlp
yt-dlp "https://www.youtube.com/watch?v=qcdivQfA41Y" -o isl_test.mp4
```

Best test videos:
- https://www.youtube.com/watch?v=qcdivQfA41Y  ← Best (slow & clear)
- https://www.youtube.com/watch?v=Vj_13bdU4dU  ← Full A–Z alphabet
- https://www.youtube.com/channel/UC3AcGIlqVI4nJWCwHgHFXtg  ← ISLRTC Official

---

## 🔧 TROUBLESHOOTING

| Problem | Solution |
|---------|----------|
| pip not found | Use `pip3` instead |
| mediapipe error | `pip install mediapipe==0.10.0` |
| Port 5000 in use | Change port in app.py last line |
| Video too slow | Normal — reduce video size/resolution |
| No detection | Ensure good lighting, hand fills frame |

---

*Based on ISLRTC (Indian Sign Language Research & Training Centre)*
*Government of India · Ministry of Social Justice & Empowerment*
