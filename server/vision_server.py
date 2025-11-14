from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from transformers import AutoProcessor, AutoModelForImageTextToText
from io import BytesIO
from PIL import Image
import torch, json, re

# Allowed chart types (must match the UI)
ALLOWED = {"line","area","bar","bar-horizontal","scatter","circle","pie","donut"}

# Choose device/dtype (MPS for Apple Silicon if available)
DEVICE = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
DTYPE = torch.float16 if DEVICE in ("mps","cuda") else torch.float32

# Load Qwen3-VL-2B-Instruct (Transformers)
# Tip: if gated, run `huggingface-cli login` before starting the server.
MODEL_ID = "Qwen/Qwen3-VL-2B-Instruct"
processor = AutoProcessor.from_pretrained(MODEL_ID, trust_remote_code=True)
model = AutoModelForImageTextToText.from_pretrained(MODEL_ID, dtype=DTYPE, trust_remote_code=True)
model.to(DEVICE)

PROMPT = (
    "Classify the chart type in this image. "
    "Choose exactly one from: line, area, bar, bar-horizontal, scatter, circle, pie, donut. "
    "Also detect whether the main plot area has visible gridlines (horizontal or vertical guide lines). "
    "Output strict JSON only: {\"chartType\":\"<label>\",\"confidence\":<0..1>,\"hasGrid\":true/false}. "
    "No extra text."
)

app = FastAPI()

# CORS for local Next.js dev (wide-open in dev to avoid mismatch issues)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # you can restrict to localhost:3000 later
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)


def parse_json_from_text(text: str):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
        ct = str(obj.get("chartType", "")).lower().strip()
        conf = float(obj.get("confidence", 0.5))
        has_grid = obj.get("hasGrid", None)
        if ct in ALLOWED:
            payload = {
                "chartType": ct,
                "confidence": max(0.0, min(1.0, conf)),
            }
            if isinstance(has_grid, bool):
                payload["hasGrid"] = has_grid
            return payload
    except Exception:
        return None
    return None


def map_text_to_label(text: str):
    t = text.lower()
    if "donut" in t or "doughnut" in t:
        return {"chartType": "donut", "confidence": 0.55}
    if "pie" in t:
        return {"chartType": "pie", "confidence": 0.55}
    if "bar-horizontal" in t or ("horizontal" in t and "bar" in t):
        return {"chartType": "bar-horizontal", "confidence": 0.55}
    if "bar" in t:
        return {"chartType": "bar", "confidence": 0.55}
    if "scatter" in t or "points" in t or "dots" in t:
        return {"chartType": "scatter", "confidence": 0.55}
    if "circle" in t:
        return {"chartType": "circle", "confidence": 0.55}
    if "area" in t:
        return {"chartType": "area", "confidence": 0.55}
    if "line" in t or "time" in t:
        return {"chartType": "line", "confidence": 0.55}
    return None


@app.options("/classify")
async def classify_preflight():
    # Manual CORS preflight handler (Starlette CORSMiddleware should handle this, but we add explicit fallback)
    return JSONResponse({"ok": True}, headers={
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    })

@app.post("/classify")
async def classify(file: UploadFile = File(...)):
    # Read and normalize image
    img = Image.open(BytesIO(await file.read())).convert("RGB")

    messages = [{
        "role": "user",
        "content": [
            {"type": "image", "image": img},
            {"type": "text", "text": PROMPT},
        ],
    }]

    inputs = processor.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    ).to(DEVICE)

    with torch.no_grad():
        out_ids = model.generate(**inputs, max_new_tokens=64, do_sample=False)
    text = processor.decode(out_ids[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=True)

    parsed = parse_json_from_text(text)
    if parsed:
        # Ensure hasGrid is always present (default False if omitted)
        if "hasGrid" not in parsed:
            parsed["hasGrid"] = False
        return JSONResponse(parsed, headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
        })

    # If no strict JSON, attempt to map the model's free text to a label (still model-driven)
    mapped = map_text_to_label(text)
    if mapped and mapped["chartType"] in ALLOWED:
        mapped["hasGrid"] = False
        return JSONResponse(mapped, headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
        })

    # Abstain if the model didn't emit anything usable
    return JSONResponse({"chartType": None, "confidence": 0.0, "hasGrid": False}, headers={
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
    })
