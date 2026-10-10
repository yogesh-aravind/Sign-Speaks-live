"""
ISLens v3 — Indian Sign Language Translator
Works with mediapipe 0.10.30, 0.10.31, 0.10.32, 0.10.33+
Flask + MediaPipe Tasks API (new style)

Run:
  pip install flask opencv-python mediapipe numpy
  python app.py
  Open: http://localhost:5000
"""

from flask import Flask, render_template, request, jsonify
import cv2, mediapipe as mp, numpy as np
import base64, os, tempfile, math, urllib.request

# ── MediaPipe Tasks API (0.10.30+) ──
from mediapipe.tasks.python.core.base_options           import BaseOptions
from mediapipe.tasks.python.vision                      import (
    HandLandmarker, HandLandmarkerOptions, RunningMode
)
from mediapipe.tasks.python.vision.hand_landmarker      import HandLandmarksConnections
from mediapipe.tasks.python.vision                      import drawing_utils as mp_draw
from mediapipe.tasks.python.vision.drawing_utils        import DrawingSpec

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 150 * 1024 * 1024  # 150 MB

# ── Auto-download the hand landmark model on first run (~8 MB) ──
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hand_landmarker.task')
MODEL_URL  = ('https://storage.googleapis.com/mediapipe-models/'
              'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task')

def ensure_model():
    if not os.path.exists(MODEL_PATH):
        print("  Downloading hand_landmarker.task (~8 MB) — one time only...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("  Model ready.")

# ─────────────────────────────────────────────
#  LANDMARK HELPERS
# ─────────────────────────────────────────────
def landmark_to_list(hand_lms):
    return [[lm.x, lm.y, lm.z] for lm in hand_lms]

# ─────────────────────────────────────────────
#  ISL LETTER CLASSIFIER  (A–Z, rule-based)
# ─────────────────────────────────────────────
def classify_letter(lm_list):
    lm = lm_list

    def is_extended(tip, dip, pip):
        return lm[tip][1] < lm[pip][1] - 0.015

    def dist(a, b):
        return math.hypot(lm[a][0]-lm[b][0], lm[a][1]-lm[b][1])

    is_right = lm[0][0] < lm[17][0]
    iU = is_extended(8, 7, 6)
    mU = is_extended(12, 11, 10)
    rU = is_extended(16, 15, 14)
    pU = is_extended(20, 19, 18)
    tO = (lm[4][0] < lm[3][0] - 0.02) if is_right else (lm[4][0] > lm[3][0] + 0.02)
    ext = sum([iU, mU, rU, pU])

    dti = dist(4, 8)
    dtm = dist(4, 12)
    dtr = dist(4, 16)
    dtp = dist(4, 20)
    dim = dist(8, 12)
    dmr = dist(12, 16)
    i_curl = lm[8][1] > lm[6][1]

    if ext == 0 and tO and not i_curl:                    return ('A', 0.84)
    if ext == 4 and not tO and dim<0.045 and dmr<0.045:  return ('B', 0.87)
    if ext >= 3 and tO and dti > 0.10 and dtp > 0.08:    return ('C', 0.76)
    if ext == 1 and iU and dtm < 0.07 and dtr < 0.07:    return ('D', 0.83)
    if ext == 0 and not tO and dti<0.06 and dtm<0.07:    return ('E', 0.75)
    if dti < 0.05 and ext >= 3:                          return ('F', 0.79)
    if not iU and tO and ext <= 1 and not pU:             return ('G', 0.70)
    if ext==2 and iU and mU and dim<0.038 and not rU and not pU: return ('H', 0.74)
    if ext==1 and pU and not iU and not mU and not rU and not tO: return ('I', 0.85)
    if ext==2 and iU and mU and tO and dim > 0.04:        return ('K', 0.80)
    if tO and iU and not mU and not rU and not pU:        return ('L', 0.90)
    if ext==1 and rU and not iU and not mU and not pU:    return ('M', 0.69)
    if ext==2 and not iU and not mU and rU and pU and not tO: return ('N', 0.68)
    if dti < 0.05 and ext <= 1:                          return ('O', 0.84)
    if ext==2 and iU and mU and tO and lm[8][1]>lm[0][1]: return ('P', 0.72)
    if dti<0.06 and iU and ext==1 and lm[8][1]>lm[6][1]+0.01: return ('Q', 0.68)
    if ext==2 and iU and mU and dim<0.03 and not tO:     return ('R', 0.74)
    if ext==0 and not tO and dti > 0.06:                 return ('S', 0.73)
    if ext==0 and not tO and dti<0.06 and dtm>0.06:      return ('T', 0.71)
    if ext==2 and iU and mU and dim<0.05 and not tO:     return ('U', 0.83)
    if ext==2 and iU and mU and dim>0.055 and not tO:    return ('V', 0.87)
    if ext==3 and iU and mU and rU and not pU:            return ('W', 0.82)
    if not iU and i_curl and ext==0 and not tO:          return ('X', 0.72)
    if tO and pU and not iU and not mU and not rU:        return ('Y', 0.88)
    return None

# ─────────────────────────────────────────────
#  ISL WORD / GESTURE CLASSIFIER  (35+ words)
# ─────────────────────────────────────────────
def classify_word_gesture(lm_list, lm2_list=None):
    lm = lm_list

    def is_ext(tip, pip): return lm[tip][1] < lm[pip][1] - 0.015
    def dist(a, b): return math.hypot(lm[a][0]-lm[b][0], lm[a][1]-lm[b][1])

    is_right = lm[0][0] < lm[17][0]
    iU = is_ext(8,6);  mU = is_ext(12,10)
    rU = is_ext(16,14); pU = is_ext(20,18)
    tO = (lm[4][0] < lm[3][0] - 0.02) if is_right else (lm[4][0] > lm[3][0] + 0.02)
    ext = sum([iU, mU, rU, pU])
    dti = dist(4,8);  dim = dist(8,12)
    dtp = dist(4,20); dtm = dist(4,12)
    dmr = dist(12,16)
    wy  = lm[0][1]
    pcx = sum(lm[i][0] for i in [0,5,9,13,17]) / 5

    if ext==4 and not tO and wy<0.4 and dim<0.05:
        return ('HELLO',    0.78, 'Flat open hand raised to head level — greeting')
    if tO and not iU and not mU and not rU and not pU and wy < 0.35:
        return ('HELP',     0.74, 'Thumbs up raised high — help')
    if tO and not iU and not mU and not rU and not pU and 0.35<=wy<=0.65:
        return ('GOOD',     0.77, 'Thumbs up — good / approval')
    if tO and ext==0 and lm[4][1] > lm[3][1]:
        return ('BAD',      0.74, 'Thumbs down — bad')
    if tO and pU and not iU and not mU and not rU:
        return ('CALL',     0.79, 'Thumb + pinky like phone — call')
    if ext==0 and not tO and dti>0.06 and wy<0.4:
        return ('YES',      0.72, 'Closed fist held up — YES')
    if ext==0 and dti<0.08 and wy>0.40 and wy<0.6:
        return ('SORRY',    0.68, 'Fist circles over chest — sorry')
    if ext==1 and iU and not mU and not rU and not pU and not tO and wy<0.5:
        return ('NO',       0.73, 'Index wagging — NO')
    if ext>=3 and wy<0.55 and dti>0.08 and not tO:
        return ('THANK YOU',0.75, 'Flat hand from chin forward — thank you')
    if ext==4 and not tO and wy>0.35 and wy<0.65 and dim<0.04:
        return ('PLEASE',   0.70, 'Open palm on chest — please')
    if ext==4 and tO and dim<0.05 and dmr<0.05:
        return ('STOP',     0.76, 'Open palm pushed outward — stop')
    if ext==3 and iU and mU and rU and not pU and wy<0.5:
        return ('WATER',    0.71, 'W-shape near mouth — water')
    if dti<0.06 and dist(4,12)<0.07 and dist(4,16)<0.08 and wy<0.55:
        return ('EAT / FOOD',0.73,'Fingers pinched to mouth — eat / food')
    if ext>=2 and dti>0.09 and wy<0.5:
        return ('DRINK',    0.70, 'C-shape tipped to mouth — drink')
    if ext==1 and iU and not mU and not rU and not pU and wy>0.3 and wy<0.7:
        return ('PAIN',     0.68, 'Index pointing at pain location')
    if ext==0 and not tO and dti<0.05 and wy>0.4:
        return ('LOVE',     0.65, 'Fist over heart — love')
    if ext==1 and iU and not tO and 0.35<pcx<0.65:
        return ('ME / I',   0.76, 'Index pointing to self — me / I')
    if ext==1 and iU and not tO and (pcx<0.35 or pcx>0.65):
        return ('YOU',      0.72, 'Index pointing outward — you')
    if ext==1 and not iU and lm[8][1]<lm[7][1] and not mU:
        return ('COME',     0.70, 'Index curved beckoning — come')
    if ext==1 and iU and not mU and wy<0.45:
        return ('GO',       0.68, 'Index pointing up/out — go')
    if ext==2 and iU and mU and dim<0.04 and wy<0.5:
        return ('NAME',     0.67, 'Two fingers tapped — name')
    if ext==1 and iU and not mU and wy<0.35:
        return ('UNDERSTAND',0.69,'Index at temple — understand')
    if ext==4 and tO and dim>0.05:
        return ('HOW MANY', 0.68, 'All fingers spread — how many')
    if dti<0.05 and ext>=2:
        return ('FAMILY',   0.65, 'F-shape circled — family')
    if ext==4 and not tO and wy>0.4:
        return ('SCHOOL',   0.64, 'Flat hands clapped — school')
    if dti<0.07 and dist(8,16)<0.08 and ext>=2:
        return ('HOME',     0.66, 'Fingertips forming roof — home')
    if tO and ext==0 and dist(4,8)<0.06:
        return ('MONEY',    0.67, 'Thumb rubs fingers — money')
    if ext==1 and iU and wy>0.55:
        return ('TIME',     0.65, 'Index at wrist — time')
    if ext==0 and not tO and wy>0.5:
        return ('WORK',     0.62, 'Closed fist — work')

    if lm2_list:
        return classify_two_hand(lm_list, lm2_list)
    return None

def classify_two_hand(lm, lm2):
    def ec(l): return sum([l[8][1]<l[6][1],l[12][1]<l[10][1],l[16][1]<l[14][1],l[20][1]<l[18][1]])
    def d2(l1,l2,a,b): return math.hypot(l1[a][0]-l2[b][0],l1[a][1]-l2[b][1])
    e1,e2 = ec(lm),ec(lm2)
    hc = d2(lm,lm2,0,0)<0.3
    if e1<=1 and e2<=1 and hc:               return ('INDIA',   0.65,'Both I-shapes — India')
    if e1==4 and e2==4 and hc:               return ('TOGETHER',0.68,'Both open hands — together')
    if e1==1 and e2==1 and d2(lm,lm2,8,8)<0.08: return ('MEET',0.72,'Index tips touching — meet')
    if e1==0 and e2==0 and hc:               return ('PROBLEM', 0.64,'Both fists — problem')
    return None

# ─────────────────────────────────────────────
#  FRAME PROCESSOR  (MediaPipe Tasks API 0.10.30+)
# ─────────────────────────────────────────────
def process_frame(frame_bgr, mode='both'):
    ensure_model()
    detections = []
    annotated  = frame_bgr.copy()
    h, w = frame_bgr.shape[:2]

    opts = HandLandmarkerOptions(
        base_options                   = BaseOptions(model_asset_path=MODEL_PATH),
        running_mode                   = RunningMode.IMAGE,
        num_hands                      = 2,
        min_hand_detection_confidence  = 0.60,
        min_hand_presence_confidence   = 0.55,
        min_tracking_confidence        = 0.50,
    )

    with HandLandmarker.create_from_options(opts) as detector:
        rgb      = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        results  = detector.detect(mp_image)

        if results.hand_landmarks:
            lm_lists = [landmark_to_list(hl) for hl in results.hand_landmarks]

            for idx, hand_lms in enumerate(results.hand_landmarks):
                mp_draw.draw_landmarks(
                    image                   = annotated,
                    landmark_list           = hand_lms,
                    connections             = HandLandmarksConnections.HAND_CONNECTIONS,
                    landmark_drawing_spec   = DrawingSpec(color=(249,115,22), thickness=2, circle_radius=5),
                    connection_drawing_spec = DrawingSpec(color=(14,165,233),  thickness=2),
                )
                lm  = lm_lists[idx]
                lm2 = lm_lists[1-idx] if len(lm_lists) > 1 else None

                letter_result = word_result = None
                if mode in ('letters','both'):
                    r = classify_letter(lm)
                    if r: letter_result = {'type':'letter','label':r[0],'confidence':r[1],'description':''}
                if mode in ('words','both'):
                    r2 = classify_word_gesture(lm, lm2)
                    if r2: word_result = {'type':'word','label':r2[0],'confidence':r2[1],'description':r2[2]}

                if word_result and letter_result:
                    best = word_result if word_result['confidence'] >= letter_result['confidence'] else letter_result
                elif word_result:   best = word_result
                elif letter_result: best = letter_result
                else:               best = None

                if best:
                    detections.append(best)
                    cx    = int(lm[0][0]*w)
                    cy    = max(int(lm[0][1]*h)-30, 30)
                    color = (0,230,130) if best['type']=='word' else (0,200,255)
                    cv2.putText(annotated, f"{best['label']} ({int(best['confidence']*100)}%)",
                                (max(cx-60,0), cy), cv2.FONT_HERSHEY_DUPLEX, 1.0, color, 2)

    return annotated, detections


def frame_to_b64(frame):
    _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 82])
    return base64.b64encode(buf).decode('utf-8')


# ─────────────────────────────────────────────
#  FLASK ROUTES
# ─────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/process-image', methods=['POST'])
def process_image():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    file   = request.files['file']
    mode   = request.form.get('mode', 'both')
    np_arr = np.frombuffer(file.read(), np.uint8)
    frame  = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if frame is None:
        return jsonify({'error': 'Invalid image'}), 400
    h, w = frame.shape[:2]
    if w > 1280:
        frame = cv2.resize(frame, (1280, int(h*1280/w)))
    annotated, detections = process_frame(frame, mode)
    return jsonify({'annotated_image': frame_to_b64(annotated), 'detections': detections})

@app.route('/api/process-video', methods=['POST'])
def process_video():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    file   = request.files['file']
    mode   = request.form.get('mode', 'both')
    suffix = os.path.splitext(file.filename)[1] or '.mp4'
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        file.save(tmp.name); tmp_path = tmp.name
    cap = None
    try:
        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            return jsonify({'error': 'Cannot open video'}), 400
        total    = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps_v    = cap.get(cv2.CAP_PROP_FPS) or 25
        duration = total / fps_v
        step     = max(1, int(total/80))
        timeline, sequence, last_label, hold = [], [], None, 0
        fi = 0
        while True:
            ret, frame = cap.read()
            if not ret: break
            if fi % step == 0:
                ts = round(fi/fps_v, 2)
                hh, ww = frame.shape[:2]
                if ww > 640:
                    frame = cv2.resize(frame, (640, int(hh*640/ww)))
                ann, dets = process_frame(frame, mode)
                timeline.append({'time':ts,'detections':dets,'image':frame_to_b64(ann)})
                if dets:
                    lbl  = dets[0]['label']
                    hold = hold+1 if lbl==last_label else 0
                    last_label = lbl
                    if hold >= 2:
                        sequence.append(lbl); hold = 0
                else:
                    last_label = None; hold = 0
            fi += 1
        return jsonify({
            'timeline':timeline, 'sequence':sequence,
            'text':' '.join(sequence),
            'duration':round(duration,1), 'fps':round(fps_v,1),
            'total_frames':total, 'sampled_frames':len(timeline)
        })
    finally:
        if cap: cap.release()
        os.unlink(tmp_path)


# ─────────────────────────────────────────────
#  START — plain HTTP, no SSL
# ─────────────────────────────────────────────
if __name__ == '__main__':
    print("=" * 58)
    print("  ISLens v3 — Indian Sign Language Translator")
    print("=" * 58)
    print("  Open: http://localhost:5000")
    print("  Stop: Ctrl+C\n")
    app.run(debug=True, host='127.0.0.1', port=5000)
