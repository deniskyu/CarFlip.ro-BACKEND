import io, time, logging
import numpy as np
import cv2
from fastapi import FastAPI, UploadFile, File, HTTPException
from nudenet import NudeDetector

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("nudenet")

app = FastAPI()
detector = NudeDetector()  # modelul ONNX, încărcat o singură dată la pornire

# ─── Praguri PER-CLASĂ (cheia acurateței) ───────────────────────────────
# Agresiv pe explicit, mai tolerant unde apar fals-pozitive (decolteu/plajă/sport).
# Reglează-le după ce vezi scorurile reale pe pozele tale.
BLOCK_RULES = {
    "FEMALE_GENITALIA_EXPOSED": 0.30,
    "MALE_GENITALIA_EXPOSED":   0.30,
    "ANUS_EXPOSED":             0.30,
    "FEMALE_BREAST_EXPOSED":    0.60,
    "BUTTOCKS_EXPOSED":         0.60,
}
MAX_BYTES = 12 * 1024 * 1024  # 12MB hard limit

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/check")
async def check(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(400, "empty file")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "file too large")

    # bytes → numpy (RAM, fără disk). cv2 decodează jpg/png/webp.
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "invalid image")

    t0 = time.perf_counter()
    detections = detector.detect(img)   # NudeNet acceptă direct array numpy
    dt = round((time.perf_counter() - t0) * 1000)

    hits = [
        d for d in detections
        if d["class"] in BLOCK_RULES and d["score"] >= BLOCK_RULES[d["class"]]
    ]
    log.info("check: %dms, %d detectii, nuditate=%s", dt, len(detections), bool(hits))

    return {
        "nudity": len(hits) > 0,
        "hits": hits,
        "all": detections,   # toate scorurile → pentru calibrare; scoți câmpul în prod
        "ms": dt,
    }