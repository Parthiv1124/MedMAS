# backend/main.py
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import json
import uvicorn
import os
import random
import time
from openai import AuthenticationError
from orchestrator import run_pipeline, medmas_graph
from state import initial_state
from services.doctor_finder import find_doctors
from services.notifications import schedule_reminder
from services.asha_service import (
    get_patient_queue, add_patient,
    save_field_assessment, update_patient_status,
    get_assessment_history,
)
from config import (
    supabase,
    GOOGLE_MAPS_API_KEY,
    DOCTORS_CSV_PATH,
    SPEECH_TO_TEXT_MODEL,
    openai_client,
)
from services.osm_doctor_finder import find_nearby_doctors
from services.notifications import send_sms
import httpx
import pandas as pd

# In-memory OTP store: {phone: {"otp": "123456", "expires_at": timestamp}}
_otp_store: dict = {}

app = FastAPI(
    title="MedMAS API",
    description="Multi-Agent AI Health System for Rural India",
    version="1.0.0"
)
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Models ─────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message:       str
    user_id:       Optional[str] = None
    user_district: Optional[str] = None
    user_phone:    Optional[str] = None
    user_lat:      Optional[float] = None
    user_lng:      Optional[float] = None

class ChatResponse(BaseModel):
    response:          str
    original_language: str
    triage_level:      str
    intent:            str
    doctor_list:       list = []
    health_score:      Optional[int] = None
    crisis_detected:   bool = False
    symptom_result:    Optional[dict] = None


class TranscriptionResponse(BaseModel):
    text: str
    model: str

# ── Endpoints ──────────────────────────────────────────────────────────────
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "MedMAS", "version": "1.0.0", "agents": 6}

@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Main endpoint: accepts text query in any Indian language."""
    try:
        result = await run_pipeline(
            raw_input=req.message,
            user_id=req.user_id,
            user_district=req.user_district,
            user_phone=req.user_phone,
            user_lat=req.user_lat,
            user_lng=req.user_lng,
        )
    except AuthenticationError:
        raise HTTPException(
            status_code=401,
            detail="DeepInfra authentication failed. Check DEEPINFRA_API_KEY and DeepInfra model names in .env.",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Persist to Supabase (non-blocking)
    try:
        if supabase:
            supabase.table("health_logs").insert({
            "user_id":  req.user_id,
            "log_type": result["intent"],
            "payload":  {
                "symptom": result.get("symptom_result"),
                "disease": result.get("disease_result"),
                "empathy": result.get("empathy_result"),
                "health":  result.get("health_result"),
            },
                "triage": result.get("triage_level", "routine"),
            }).execute()
    except Exception:
        pass  # Non-blocking

    health_score = None
    if result.get("health_result"):
        health_score = result["health_result"].get("total_score")

    return ChatResponse(
        response=result.get("final_response", ""),
        original_language=result.get("input_lang", "en"),
        triage_level=result.get("triage_level", "routine"),
        intent=result.get("intent", ""),
        doctor_list=result.get("doctor_list") or [],
        health_score=health_score,
        crisis_detected=result.get("crisis_detected", False),
        symptom_result=result.get("symptom_result"),
    )

@app.post("/api/upload-lab")
async def upload_lab(
    file:          UploadFile = File(...),
    user_id:       str        = Form(None),
    user_district: str        = Form(None),
    user_phone:    str        = Form(None),
):
    """Accepts a PDF lab report, runs Disease Predictor agent."""
    if not file.filename.endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted.")
    pdf_bytes = await file.read()
    try:
        result = await run_pipeline(
            raw_input="Lab report uploaded for analysis",
            media_type="pdf",
            pdf_bytes=pdf_bytes,
            user_id=user_id,
            user_district=user_district,
            user_phone=user_phone,
        )
    except Exception as e:
        raise HTTPException(500, str(e))

    return {
        "response":       result.get("final_response", ""),
        "disease_result": result.get("disease_result"),
        "triage_level":   result.get("triage_level", "routine"),
        "doctor_list":    result.get("doctor_list") or [],
    }


@app.post("/api/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribe recorded audio using DeepInfra's OpenAI-compatible STT API."""
    if not file.filename:
        raise HTTPException(400, "Audio file is required.")

    content_type = (file.content_type or "").lower()
    allowed_prefixes = (
        "audio/webm",
        "audio/wav",
        "audio/x-wav",
        "audio/mpeg",
        "audio/mp4",
        "audio/x-m4a",
        "audio/mp4a-latm",
        "audio/ogg",
    )
    if content_type and not any(content_type.startswith(prefix) for prefix in allowed_prefixes):
        raise HTTPException(400, f"Unsupported audio type: {content_type}")

    audio_bytes = await file.read()
    print(
        f"[Transcribe] filename={file.filename!r} content_type={content_type!r} bytes={len(audio_bytes)}"
    )
    if not audio_bytes:
        raise HTTPException(400, "Uploaded audio is empty.")

    try:
        transcription = openai_client.audio.transcriptions.create(
            model=SPEECH_TO_TEXT_MODEL,
            file=(file.filename, audio_bytes, file.content_type or "application/octet-stream"),
        )
    except AuthenticationError:
        raise HTTPException(
            status_code=401,
            detail="DeepInfra authentication failed. Check DEEPINFRA_API_KEY and speech model configuration.",
        )
    except Exception as e:
        raise HTTPException(500, f"Speech transcription failed: {e}")

    text = (getattr(transcription, "text", "") or "").strip()
    if not text:
        raise HTTPException(502, "Speech transcription returned empty text.")

    return TranscriptionResponse(text=text, model=SPEECH_TO_TEXT_MODEL)

@app.get("/api/doctors")
def get_doctors(specialty: str = "General", district: str = ""):
    return {"doctors": find_doctors(specialty=specialty, district=district)}

@app.get("/api/nearby-doctors")
async def nearby_doctors(lat: float, lng: float, specialty: str = "General", radius: int = 5000, limit: int = 5):
    """Fetch real nearby doctors from OpenStreetMap based on user's live location."""
    doctors = await find_nearby_doctors(lat=lat, lng=lng, specialty=specialty, radius=radius, limit=limit)
    if not doctors:
        # Fallback to CSV
        doctors = find_doctors(specialty=specialty)
    return {"doctors": doctors, "source": "osm" if doctors and "id" in doctors[0] else "csv"}

@app.get("/api/crisis-resources")
def get_crisis_resources():
    return {
        "icall":      {"number": "9152987821", "hours": "Mon-Sat 8am-10pm", "cost": "free"},
        "vandrevala": {"number": "1860-2662-345", "hours": "24x7", "cost": "free"},
        "snehi":      {"number": "044-24640050", "hours": "24x7"},
        "emergency":  "112"
    }

# ── Geocode Endpoint ─────────────────────────────────────────────────────
class GeocodeRequest(BaseModel):
    lat: float
    lng: float

@app.post("/api/geocode")
async def reverse_geocode(req: GeocodeRequest):
    """Reverse-geocode lat/lng → district using OpenStreetMap Nominatim (free)."""
    url = "https://nominatim.openstreetmap.org/reverse"
    params = {
        "lat": req.lat,
        "lon": req.lng,
        "format": "jsonv2",
        "addressdetails": 1,
        "zoom": 10,
    }
    headers = {"User-Agent": "MedMAS/1.0 (health-app)"}

    async with httpx.AsyncClient() as client:
        resp = await client.get(url, params=params, headers=headers)
        data = resp.json()

    if "error" in data or "address" not in data:
        raise HTTPException(400, "Could not resolve location")

    addr = data["address"]
    # Nominatim returns city, town, county, state_district, state etc.
    detected_names = [
        v for k, v in addr.items()
        if k in ("city", "town", "city_district", "county", "state_district", "village", "suburb")
    ]
    # Also add state for broader matching
    if addr.get("state"):
        detected_names.append(addr["state"])

    # Match against known districts in doctors.csv
    try:
        df = pd.read_csv(DOCTORS_CSV_PATH)
        known_districts = [d.strip() for d in df["district"].dropna().unique()]
    except Exception:
        known_districts = ["Vadodara", "Surat", "Rajkot", "Bharuch", "Ahmedabad", "Mumbai", "Delhi"]

    # Try exact match first
    for name in detected_names:
        for kd in known_districts:
            if name.lower() == kd.lower():
                return {"district": kd, "detected": name, "matched": True}

    # Try partial/substring match (e.g. "Vadodara District" contains "Vadodara")
    for name in detected_names:
        for kd in known_districts:
            if kd.lower() in name.lower() or name.lower() in kd.lower():
                return {"district": kd, "detected": name, "matched": True}

    # No match — return detected name + known districts for fallback
    return {
        "district": detected_names[0] if detected_names else "",
        "detected": detected_names[0] if detected_names else "",
        "matched": False,
        "known_districts": known_districts,
    }

@app.get("/api/districts")
def list_districts():
    """Return all distinct districts available in doctors.csv."""
    try:
        df = pd.read_csv(DOCTORS_CSV_PATH)
        districts = sorted(df["district"].dropna().unique().tolist())
    except Exception:
        districts = ["Vadodara", "Surat", "Rajkot", "Bharuch", "Ahmedabad", "Mumbai", "Delhi"]
    return {"districts": districts}

# ── OTP Models & Endpoints ────────────────────────────────────────────────
OTP_EXPIRY_SECONDS = 600  # 10 minutes

class OTPSendRequest(BaseModel):
    phone: str  # expected format: +91XXXXXXXXXX

class OTPVerifyRequest(BaseModel):
    phone: str
    otp:   str

@app.post("/api/auth/send-otp")
def send_otp(req: OTPSendRequest):
    """Generate a 6-digit OTP and send it via SMS."""
    phone = req.phone.strip()
    if not phone.startswith("+91") or len(phone) != 13:
        raise HTTPException(400, "Phone must be in +91XXXXXXXXXX format")

    otp = str(random.randint(100000, 999999))
    _otp_store[phone] = {"otp": otp, "expires_at": time.time() + OTP_EXPIRY_SECONDS}

    message = f"Your MedMAS verification code is {otp}. Valid for 10 minutes. Do not share with anyone."
    sent = send_sms(phone, message)

    if not sent:
        # Dev fallback: return OTP in response when Twilio is not configured
        return {"sent": False, "dev_otp": otp, "message": "Twilio not configured — use dev_otp for testing"}

    return {"sent": True}

@app.post("/api/auth/verify-otp")
def verify_otp(req: OTPVerifyRequest):
    """Verify the OTP entered by the user."""
    phone  = req.phone.strip()
    record = _otp_store.get(phone)

    if not record:
        raise HTTPException(400, "No OTP sent to this number. Request a new one.")
    if time.time() > record["expires_at"]:
        _otp_store.pop(phone, None)
        raise HTTPException(400, "OTP has expired. Please request a new one.")
    if req.otp.strip() != record["otp"]:
        raise HTTPException(400, "Incorrect OTP. Please try again.")

    _otp_store.pop(phone, None)  # single-use
    return {"verified": True}

# ── Auth Models ────────────────────────────────────────────────────────────
class SignupRequest(BaseModel):
    name:     str
    email:    str
    phone:    str
    district: str = ""
    password: str

class LoginRequest(BaseModel):
    email:    str
    password: str

# ── Auth Endpoints ────────────────────────────────────────────────────────
@app.post("/api/auth/signup")
async def signup(req: SignupRequest):
    """Register a new user via Supabase Auth."""
    if not supabase:
        raise HTTPException(503, "Auth service not configured")
    try:
        auth_res = supabase.auth.sign_up({
            "email": req.email,
            "password": req.password,
            "options": {
                "data": {
                    "name": req.name,
                    "phone": req.phone,
                    "district": req.district,
                }
            }
        })
        if auth_res.user is None:
            raise HTTPException(400, "Signup failed — check email and password")
        return {
            "access_token": auth_res.session.access_token if auth_res.session else "",
            "user": {
                "id":       auth_res.user.id,
                "email":    auth_res.user.email,
                "name":     req.name,
                "phone":    req.phone,
                "district": req.district,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/api/auth/login")
async def login(req: LoginRequest):
    """Authenticate user via Supabase Auth."""
    if not supabase:
        raise HTTPException(503, "Auth service not configured")
    try:
        auth_res = supabase.auth.sign_in_with_password({
            "email": req.email,
            "password": req.password,
        })
        if auth_res.user is None:
            raise HTTPException(401, "Invalid email or password")
        user_meta = auth_res.user.user_metadata or {}
        return {
            "access_token": auth_res.session.access_token,
            "user": {
                "id":       auth_res.user.id,
                "email":    auth_res.user.email,
                "name":     user_meta.get("name", ""),
                "phone":    user_meta.get("phone", ""),
                "district": user_meta.get("district", ""),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(401, str(e))

# ── Phase 2 Models ─────────────────────────────────────────────────────────
class HealthScoreRequest(BaseModel):
    user_id:                  Optional[str] = None
    sleep_hours:              float = 7.0
    exercise_days_per_week:   int   = 3
    balanced_meals_per_day:   int   = 2
    stress_level:             float = 5.0
    water_litres_per_day:     float = 2.0
    smoker:                   bool  = False
    alcohol_units_per_week:   int   = 0

class ReminderRequest(BaseModel):
    phone:         str
    message:       str
    days_from_now: int = 7

# ── Phase 2 Endpoints ─────────────────────────────────────────────────────
@app.post("/api/health-score")
async def submit_health_score(req: HealthScoreRequest):
    """Submit lifestyle data and receive a 5-dimension health score."""
    lifestyle_json = json.dumps(req.dict())
    try:
        result = await run_pipeline(raw_input=lifestyle_json, user_id=req.user_id)
    except Exception as e:
        raise HTTPException(500, str(e))
    return {
        "health_result":   result.get("health_result"),
        "final_response":  result.get("final_response", ""),
        "session_context": result.get("session_context", {}),
    }

@app.post("/api/reminder")
def set_reminder(req: ReminderRequest):
    """Schedule an SMS health reminder via Twilio + APScheduler."""
    schedule_reminder(req.phone, req.message, req.days_from_now)
    return {"scheduled": True, "message": req.message, "days_from_now": req.days_from_now}

@app.get("/api/history/{user_id}")
def get_history(user_id: str, limit: int = 20):
    """Retrieve past health logs for a user from Supabase."""
    if not supabase:
        raise HTTPException(503, "Supabase not configured")
    try:
        result = (
            supabase.table("health_logs")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {"logs": result.data}
    except Exception as e:
        raise HTTPException(500, str(e))

# ── Phase 3 Models ─────────────────────────────────────────────────────────
class ASHAAssessRequest(BaseModel):
    asha_worker_id: str
    patient_id:     str
    observations:   str
    user_district:  Optional[str] = None
    user_lat:       Optional[float] = None
    user_lng:       Optional[float] = None

class AddPatientRequest(BaseModel):
    asha_worker_id: str
    name:           str
    age:            int
    gender:         str
    village:        str
    district:       str
    priority:       int = 1
    notes:          str = ""

# ── Phase 3 ASHA Endpoints ────────────────────────────────────────────────
@app.get("/api/asha/queue/{worker_id}")
def get_queue(worker_id: str):
    """Fetch active patient queue for an ASHA worker."""
    try:
        return {"patients": get_patient_queue(worker_id)}
    except RuntimeError as e:
        raise HTTPException(503, str(e))

@app.post("/api/asha/patient")
def create_patient(req: AddPatientRequest):
    """Add a new patient to an ASHA worker's queue."""
    try:
        patient = add_patient(
            asha_worker_id=req.asha_worker_id,
            name=req.name,
            age=req.age,
            gender=req.gender,
            village=req.village,
            district=req.district,
            priority=req.priority,
            notes=req.notes,
        )
        return {"patient": patient}
    except RuntimeError as e:
        raise HTTPException(503, str(e))

@app.post("/api/asha/assess")
async def asha_assess(req: ASHAAssessRequest):
    """ASHA field assessment — routes through Agent 6."""
    state = initial_state(
        raw_input=req.observations,
        media_type="text",
        user_district=req.user_district,
        user_lat=req.user_lat,
        user_lng=req.user_lng,
    )
    state["asha_mode"]       = True
    state["asha_worker_id"]  = req.asha_worker_id
    state["patient_id"]      = req.patient_id
    state["intent"]          = "asha"

    try:
        result = await medmas_graph.ainvoke(state)
    except Exception as e:
        raise HTTPException(500, str(e))

    # Persist assessment to Supabase (non-blocking)
    if result.get("asha_result"):
        try:
            save_field_assessment(
                patient_id=req.patient_id,
                asha_worker_id=req.asha_worker_id,
                asha_result=result["asha_result"],
            )
            if result["asha_result"].get("triage_decision") == "refer_urgent":
                update_patient_status(req.patient_id, "referred")
        except Exception:
            pass  # Non-blocking — Supabase save is optional

    return {
        "asha_result":     result.get("asha_result"),
        "final_response":  result.get("final_response", ""),
        "triage_level":    result.get("triage_level", "routine"),
        "doctor_list":     result.get("doctor_list") or [],
        "crisis_detected": result.get("crisis_detected", False),
        "session_context": result.get("session_context", {}),
    }

@app.get("/api/asha/history/{patient_id}")
def patient_history(patient_id: str):
    """Get all assessments for a patient."""
    try:
        return {"assessments": get_assessment_history(patient_id)}
    except RuntimeError as e:
        raise HTTPException(503, str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
