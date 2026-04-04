# backend/main.py
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
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
    get_selected_patient_id, set_selected_patient_id,
)
from services.chat_history import (
    list_chat_sessions,
    get_chat_session,
    save_chat_exchange,
    delete_chat_session,
)
from services.doctor_service import (
    register_doctor,
    get_doctor_by_user_id,
    get_doctor_by_id,
    list_doctors,
    update_doctor_status,
    match_doctors,
)
from services.case_service import (
    create_case,
    get_case,
    list_cases_for_user,
    list_cases_for_session,
    list_cases_for_doctor,
    list_unassigned_cases,
    assign_case,
    accept_case,
    start_case,
    complete_case,
    close_case,
    send_message,
    get_messages,
    grant_consent,
    revoke_consent,
    get_consent_for_case,
)
from services.prescription_service import (
    create_prescription,
    get_prescriptions_for_case,
    get_prescriptions_for_patient,
)
from config import (
    supabase,
    supabase_db,
    GOOGLE_MAPS_API_KEY,
    DOCTORS_CSV_PATH,
    SPEECH_TO_TEXT_MODEL,
    openai_client,
)
from services.osm_doctor_finder import find_nearby_doctors
from services.notifications import send_sms
import httpx
import pandas as pd
import logging

LOGGER = logging.getLogger("medmas.api")
if not LOGGER.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("[API] %(message)s"))
    LOGGER.addHandler(handler)
LOGGER.setLevel(logging.INFO)

# In-memory OTP store: {phone: {"otp": "123456", "expires_at": timestamp}}
_otp_store: dict = {}


def _parse_json_field(raw: Optional[str], default):
    if not raw:
        return default
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return default
    return value if isinstance(value, type(default)) else default


def _build_assistant_meta(result: dict, *, is_asha: bool = False) -> dict:
    meta = {
        "triage": result.get("triage_level", "routine"),
        "intent": "asha" if is_asha else result.get("intent", ""),
        "crisis": result.get("crisis_detected", False),
        "doctors": result.get("doctor_list") or [],
    }
    if result.get("input_lang"):
        meta["lang"] = result.get("input_lang")
    if result.get("symptom_result"):
        meta["symptomResult"] = result.get("symptom_result")
    if result.get("asha_result"):
        meta["asha"] = result.get("asha_result")
    return meta


def _persist_chat_turn(
    *,
    user_id: Optional[str],
    session_id: Optional[str],
    session_title: Optional[str],
    session_tab: Optional[str],
    session_context: Optional[dict],
    user_content: str,
    user_meta: Optional[dict],
    assistant_content: str,
    assistant_meta: dict,
) -> None:
    if not supabase or not user_id or not session_id:
        return
    save_chat_exchange(
        user_id=user_id,
        session_id=session_id,
        title=session_title or "New Chat",
        tab=session_tab or "chat",
        session_context=session_context or {},
        user_message={
            "content": user_content or "",
            "meta": user_meta or {},
        },
        assistant_message={
            "content": assistant_content or "",
            "meta": assistant_meta or {},
        },
    )


def _sort_by_created_at(rows: list[dict], *, reverse: bool = False) -> list[dict]:
    return sorted(rows, key=lambda row: row.get("created_at") or "", reverse=reverse)


def _build_session_consultation(user_id: Optional[str], session_id: Optional[str]) -> Optional[dict]:
    if not user_id or not session_id:
        return None

    cases = list_cases_for_session(user_id, session_id)
    if not cases:
        return None

    enriched_cases = []
    all_messages = []
    all_prescriptions = []

    for case in cases:
        case_id = case.get("id")
        if not case_id:
            continue

        messages = get_messages(case_id)
        prescriptions = get_prescriptions_for_case(case_id)
        enriched_case = {
            **case,
            "messages": messages,
            "prescriptions": prescriptions,
        }
        enriched_cases.append(enriched_case)

        all_messages.extend(
            {
                **message,
                "case_id": case_id,
                "case_status": case.get("status"),
            }
            for message in messages
        )
        all_prescriptions.extend(
            {
                **prescription,
                "case_id": case_id,
                "case_status": case.get("status"),
            }
            for prescription in prescriptions
        )

    if not enriched_cases:
        return None

    return {
        "cases": enriched_cases,
        "latest_case": enriched_cases[0],
        "messages": _sort_by_created_at(all_messages),
        "prescriptions": _sort_by_created_at(all_prescriptions, reverse=True),
    }


def _sync_public_user(
    user_id: str,
    phone: str = "",
    district: str = "",
    lang_code: str = "en",
    state: str = "",
):
    """Ensure the public users table contains the current auth user."""
    if not supabase_db or not user_id:
        return

    normalized_phone = (phone or "").strip()
    if not normalized_phone:
        raise ValueError("User phone is required to sync with the public users table.")

    supabase_db.table("users").upsert(
        {
            "id": user_id,
            "phone": normalized_phone,
            "district": district,
            "lang_code": lang_code or "en",
            "state": state or None,
        },
        on_conflict="id",
    ).execute()

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
    session_id:    Optional[str] = None
    session_title: Optional[str] = None
    session_tab:   Optional[str] = "chat"
    user_district: Optional[str] = None
    user_phone:    Optional[str] = None
    user_lat:      Optional[float] = None
    user_lng:      Optional[float] = None
    session_context: Optional[dict] = None
    chat_history:  List[dict] = []

class ChatResponse(BaseModel):
    response:          str
    original_language: str
    triage_level:      str
    intent:            str
    doctor_list:       list = []
    health_score:      Optional[int] = None
    crisis_detected:   bool = False
    symptom_result:    Optional[dict] = None
    session_context:   dict = {}
    consultation:      Optional[dict] = None


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
    LOGGER.info(f"chat request user={req.user_id or 'anon'} tab={req.session_tab} message={req.message[:80]}")
    try:
        result = await run_pipeline(
            raw_input=req.message,
            user_id=req.user_id,
            user_district=req.user_district,
            user_phone=req.user_phone,
            user_lat=req.user_lat,
            user_lng=req.user_lng,
            session_context=req.session_context or {},
            session_history=req.chat_history,
        )
    except AuthenticationError:
        raise HTTPException(
            status_code=401,
            detail="DeepInfra authentication failed. Check DEEPINFRA_API_KEY and DeepInfra model names in .env.",
        )
    except Exception as e:
        LOGGER.exception("chat request failed")
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

    try:
        _persist_chat_turn(
            user_id=req.user_id,
            session_id=req.session_id,
            session_title=req.session_title,
            session_tab=req.session_tab,
            session_context=result.get("session_context", {}),
            user_content=req.message,
            user_meta={},
            assistant_content=result.get("final_response", ""),
            assistant_meta=_build_assistant_meta(result),
        )
    except Exception:
        pass

    consultation = None
    try:
        consultation = _build_session_consultation(req.user_id, req.session_id)
    except Exception:
        pass

    return ChatResponse(
        response=result.get("final_response", ""),
        original_language=result.get("input_lang", "en"),
        triage_level=result.get("triage_level", "routine"),
        intent=result.get("intent", ""),
        doctor_list=result.get("doctor_list") or [],
        health_score=health_score,
        crisis_detected=result.get("crisis_detected", False),
        symptom_result=result.get("symptom_result"),
        session_context=result.get("session_context", {}),
        consultation=consultation,
    )

@app.post("/api/chat/upload")
async def chat_upload(
    files:         List[UploadFile] = File(...),
    message:       str              = Form(""),
    user_id:       str              = Form(None),
    session_id:    str              = Form(None),
    session_title: str              = Form(None),
    session_tab:   str              = Form("chat"),
    user_district: str              = Form(None),
    user_phone:    str              = Form(None),
    user_lat:      float            = Form(None),
    user_lng:      float            = Form(None),
    chat_history:  str              = Form("[]"),
    session_context: str            = Form("{}"),
):
    """Chat endpoint that accepts file attachments (images + documents)."""
    from services.image_parser import extract_text_from_image

    extracted_parts = []
    pdf_bytes_combined = None
    uploaded_files_meta = []

    for f in files:
        content = await f.read()
        ctype = f.content_type or ""
        uploaded_files_meta.append(
            {
                "name": f.filename,
                "type": "image" if ctype.startswith("image/") else "document",
                "url": None,
            }
        )

        if ctype.startswith("image/"):
            # Use vision model to extract text/findings from the image
            extracted = extract_text_from_image(content, ctype)
            extracted_parts.append(f"[Extracted from image '{f.filename}']:\n{extracted}")
        elif ctype == "application/pdf" or (f.filename and f.filename.endswith(".pdf")):
            pdf_bytes_combined = content
        else:
            # Text-based documents: extract content as text
            try:
                text_content = content.decode("utf-8", errors="replace")
                extracted_parts.append(f"[Content of '{f.filename}']:\n{text_content[:5000]}")
            except Exception:
                extracted_parts.append(f"[Attached document: {f.filename} — could not read contents]")

    LOGGER.info(
        f"chat/upload user={user_id or 'anon'} session_id={session_id} files={[f.filename for f in files]} "
        f"pdf={'yes' if pdf_bytes_combined else 'no'}"
    )

    # Build enriched message with extracted content
    enriched = message or ""
    if extracted_parts:
        enriched = enriched + "\n\n" + "\n\n".join(extracted_parts)

    media_type = "pdf" if pdf_bytes_combined else "text"
    parsed_history = _parse_json_field(chat_history, [])
    parsed_context = _parse_json_field(session_context, {})

    try:
        result = await run_pipeline(
            raw_input=enriched or "User uploaded files for analysis",
            media_type=media_type,
            pdf_bytes=pdf_bytes_combined,
            user_id=user_id,
            user_district=user_district,
            user_phone=user_phone,
            user_lat=user_lat,
            user_lng=user_lng,
            session_context=parsed_context,
            session_history=parsed_history,
            hint_intent="lab" if media_type == "pdf" else None,
        )
    except AuthenticationError:
        raise HTTPException(401, "DeepInfra authentication failed.")
    except Exception as e:
        LOGGER.exception("chat/upload failed")
        raise HTTPException(500, str(e))

    health_score = None
    if result.get("health_result"):
        health_score = result["health_result"].get("total_score")

    try:
        _persist_chat_turn(
            user_id=user_id,
            session_id=session_id,
            session_title=session_title,
            session_tab=session_tab,
            session_context=result.get("session_context", {}),
            user_content=message or "[Uploaded files]",
            user_meta={"files": uploaded_files_meta} if uploaded_files_meta else {},
            assistant_content=result.get("final_response", ""),
            assistant_meta=_build_assistant_meta(result),
        )
    except Exception:
        pass

    consultation = None
    try:
        consultation = _build_session_consultation(user_id, session_id)
    except Exception:
        pass

    return ChatResponse(
        response=result.get("final_response", ""),
        original_language=result.get("input_lang", "en"),
        triage_level=result.get("triage_level", "routine"),
        intent=result.get("intent", ""),
        doctor_list=result.get("doctor_list") or [],
        health_score=health_score,
        crisis_detected=result.get("crisis_detected", False),
        symptom_result=result.get("symptom_result"),
        session_context=result.get("session_context", {}),
        consultation=consultation,
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
    LOGGER.info(f"upload_lab user={user_id or 'anon'} filename={file.filename}")
    try:
        result = await run_pipeline(
            raw_input="Lab report uploaded for analysis",
            media_type="pdf",
            pdf_bytes=pdf_bytes,
            user_id=user_id,
            user_district=user_district,
            user_phone=user_phone,
            hint_intent="lab",
        )
    except Exception as e:
        LOGGER.exception("upload_lab failed")
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
        _sync_public_user(
            user_id=auth_res.user.id,
            phone=req.phone,
            district=req.district,
        )
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
        _sync_public_user(
            user_id=auth_res.user.id,
            phone=user_meta.get("phone", ""),
            district=user_meta.get("district", ""),
            lang_code=user_meta.get("lang_code", "en"),
            state=user_meta.get("state", ""),
        )
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

@app.get("/api/chat/sessions/{user_id}")
def get_chat_sessions(user_id: str):
    if not supabase:
        raise HTTPException(503, "Supabase not configured")
    try:
        return {"sessions": list_chat_sessions(user_id)}
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))

@app.get("/api/chat/sessions/{user_id}/{session_id}")
def get_chat_session_detail(user_id: str, session_id: str):
    if not supabase:
        raise HTTPException(503, "Supabase not configured")
    try:
        payload = get_chat_session(user_id, session_id)
        if not payload.get("session"):
            raise HTTPException(404, "Chat session not found")
        payload["consultation"] = _build_session_consultation(user_id, session_id)
        return payload
    except HTTPException:
        raise
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))

@app.delete("/api/chat/sessions/{user_id}/{session_id}")
def remove_chat_session(user_id: str, session_id: str):
    if not supabase:
        raise HTTPException(503, "Supabase not configured")
    try:
        delete_chat_session(user_id, session_id)
        return {"deleted": True}
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))

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
    user_id:        Optional[str] = None
    session_id:     Optional[str] = None
    session_title:  Optional[str] = None
    session_tab:    Optional[str] = "asha"
    user_district:  Optional[str] = None
    user_lat:       Optional[float] = None
    user_lng:       Optional[float] = None
    session_context: Optional[dict] = None
    chat_history:   List[dict] = []

class AddPatientRequest(BaseModel):
    asha_worker_id: str
    asha_worker_phone: Optional[str] = None
    asha_worker_district: Optional[str] = None
    name:           str
    age:            int
    gender:         str
    village:        str
    district:       str
    priority:       int = 1
    notes:          str = ""


class ASHASelectedPatientRequest(BaseModel):
    asha_worker_id: str
    patient_id: Optional[str] = None

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
        _sync_public_user(
            user_id=req.asha_worker_id,
            phone=req.asha_worker_phone or "",
            district=req.asha_worker_district or req.district,
        )
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
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Unable to create patient: {e}")


@app.get("/api/asha/selected-patient/{worker_id}")
def get_selected_patient(worker_id: str):
    """Get the server-persisted selected patient for an ASHA worker."""
    try:
        return {"patient_id": get_selected_patient_id(worker_id)}
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@app.post("/api/asha/selected-patient")
def set_selected_patient(req: ASHASelectedPatientRequest):
    """Persist the selected patient for an ASHA worker."""
    try:
        set_selected_patient_id(req.asha_worker_id, req.patient_id)
        return {"ok": True, "patient_id": req.patient_id}
    except RuntimeError as e:
        raise HTTPException(503, str(e))

@app.post("/api/asha/assess")
async def asha_assess(req: ASHAAssessRequest):
    """ASHA field assessment — routes through Agent 6."""
    state = initial_state(
        raw_input=req.observations,
        media_type="text",
        user_id=req.user_id,
        user_district=req.user_district,
        user_lat=req.user_lat,
        user_lng=req.user_lng,
        session_context=req.session_context or {},
        session_history=req.chat_history,
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

    try:
        _persist_chat_turn(
            user_id=req.user_id,
            session_id=req.session_id,
            session_title=req.session_title,
            session_tab=req.session_tab,
            session_context=result.get("session_context", {}),
            user_content=f"[ASHA] {req.observations}",
            user_meta={},
            assistant_content=result.get("final_response", ""),
            assistant_meta=_build_assistant_meta(result, is_asha=True),
        )
    except Exception:
        pass

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

# ── Doctor Consultation Models ────────────────────────────────────────────

class DoctorSignupRequest(BaseModel):
    name:           str
    email:          str
    phone:          str
    password:       str
    specialty:      str = "General"
    license_number: str = ""
    district:       str = ""
    bio:            str = ""

class DoctorLoginRequest(BaseModel):
    email:    str
    password: str

class CreateCaseRequest(BaseModel):
    user_id:          str
    session_id:       Optional[str] = None
    symptoms_summary: str = ""
    ai_suggestion:    str = ""
    triage_level:     str = "routine"
    specialty_needed: str = "General"
    district:         str = ""
    consent_scope:    List[str] = ["chat"]
    doctor_id:        Optional[str] = None  # if set, case is directly assigned to this doctor

class CaseStatusRequest(BaseModel):
    case_id:   str
    doctor_id: Optional[str] = None

class SendMessageRequest(BaseModel):
    case_id:     str
    sender_id:   str
    sender_type: str   # "doctor" | "patient"
    message:     str

class PrescriptionRequest(BaseModel):
    case_id:        str
    doctor_id:      str
    patient_id:     str
    diagnosis:      str = ""
    medications:    List[dict] = []
    instructions:   str = ""
    follow_up_date: Optional[str] = None

class ConsentRevokeRequest(BaseModel):
    consent_id: str

# ── Doctor Auth Endpoints ─────────────────────────────────────────────────

@app.post("/api/doctor/signup")
async def doctor_signup(req: DoctorSignupRequest):
    """Register a new doctor: create auth user + doctor profile."""
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
                    "role": "doctor",
                }
            }
        })
        if auth_res.user is None:
            raise HTTPException(400, "Signup failed — check email and password")
        # Sync public.users — non-blocking; the auth trigger may have already done this
        try:
            _sync_public_user(
                user_id=auth_res.user.id,
                phone=req.phone,
                district=req.district,
            )
        except Exception as sync_err:
            print(f"[Doctor Signup] _sync_public_user non-fatal: {sync_err}")
        doctor = register_doctor(
            user_id=auth_res.user.id,
            name=req.name,
            email=req.email,
            phone=req.phone,
            specialty=req.specialty,
            license_number=req.license_number,
            district=req.district,
            bio=req.bio,
        )
        return {
            "access_token": auth_res.session.access_token if auth_res.session else "",
            "user": {
                "id":       auth_res.user.id,
                "email":    auth_res.user.email,
                "name":     req.name,
                "phone":    req.phone,
                "district": req.district,
                "role":     "doctor",
            },
            "doctor": doctor,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/doctor/login")
async def doctor_login(req: DoctorLoginRequest):
    """Authenticate doctor and return profile."""
    if not supabase:
        raise HTTPException(503, "Auth service not configured")
    try:
        auth_res = supabase.auth.sign_in_with_password({
            "email": req.email,
            "password": req.password,
        })
        if auth_res.user is None:
            raise HTTPException(401, "Invalid email or password")
        doctor = get_doctor_by_user_id(auth_res.user.id)
        if not doctor:
            raise HTTPException(403, "No doctor profile found for this account")
        user_meta = auth_res.user.user_metadata or {}
        return {
            "access_token": auth_res.session.access_token,
            "user": {
                "id":       auth_res.user.id,
                "email":    auth_res.user.email,
                "name":     user_meta.get("name", ""),
                "phone":    user_meta.get("phone", ""),
                "district": user_meta.get("district", ""),
                "role":     "doctor",
            },
            "doctor": doctor,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(401, str(e))


@app.get("/api/doctor/profile/{user_id}")
def get_doctor_profile(user_id: str):
    """Get doctor profile by auth user ID."""
    doctor = get_doctor_by_user_id(user_id)
    if not doctor:
        raise HTTPException(404, "Doctor not found")
    return {"doctor": doctor}


@app.post("/api/admin/doctor/verify/{doctor_id}")
def admin_verify_doctor(doctor_id: str):
    """Admin endpoint: verify a doctor (pending → verified).

    In production, add authentication + authorization checks here.
    For now, this is accessible to anyone — add API key or auth guard.
    """
    try:
        doctor = update_doctor_status(doctor_id, "verified")
        return {"doctor": doctor, "status": "verified"}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@app.post("/api/admin/doctor/reject/{doctor_id}")
def admin_reject_doctor(doctor_id: str):
    """Admin endpoint: reject a doctor (pending → rejected)."""
    try:
        doctor = update_doctor_status(doctor_id, "rejected")
        return {"doctor": doctor, "status": "rejected"}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@app.get("/api/doctors/list")
def list_all_doctors(specialty: str = "", district: str = "", verified_only: bool = True):
    """List doctors with optional filters."""
    return {"doctors": list_doctors(specialty, district, verified_only)}


# ── Case Endpoints ────────────────────────────────────────────────────────

@app.post("/api/cases")
def create_new_case(req: CreateCaseRequest):
    """Patient requests a doctor consultation — creates case + consent."""
    try:
        case = create_case(
            user_id=req.user_id,
            session_id=req.session_id,
            symptoms_summary=req.symptoms_summary,
            ai_suggestion=req.ai_suggestion,
            triage_level=req.triage_level,
            specialty_needed=req.specialty_needed,
            district=req.district,
        )
        if not case:
            raise HTTPException(500, "Failed to create case")

        consent = grant_consent(
            user_id=req.user_id,
            case_id=case["id"],
            doctor_id=req.doctor_id,
            scope=req.consent_scope,
        )

        # If a specific doctor was chosen, assign directly (requested → assigned)
        if req.doctor_id:
            case = assign_case(case["id"], req.doctor_id)

        # Auto-match doctors for informational display
        matched = match_doctors(
            specialty=req.specialty_needed,
            district=req.district,
            limit=5,
        )

        return {"case": case, "consent": consent, "matched_doctors": matched}
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/cases/user/{user_id}")
def get_user_cases(user_id: str):
    """List all cases for a patient."""
    try:
        return {"cases": list_cases_for_user(user_id)}
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@app.get("/api/cases/doctor/{doctor_id}")
def get_doctor_cases(doctor_id: str):
    """List active cases assigned to a doctor — the doctor's queue."""
    try:
        return {"cases": list_cases_for_doctor(doctor_id)}
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@app.get("/api/cases/unassigned")
def get_unassigned_cases(specialty: str = "", district: str = ""):
    """List cases waiting to be assigned to a doctor."""
    try:
        return {"cases": list_unassigned_cases(specialty, district)}
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@app.get("/api/cases/{case_id}")
def get_case_detail(case_id: str):
    """Get full case detail including consent, messages, prescriptions."""
    try:
        case = get_case(case_id)
        if not case:
            raise HTTPException(404, "Case not found")
        consent = get_consent_for_case(case_id)
        messages = get_messages(case_id)
        prescriptions = get_prescriptions_for_case(case_id)
        return {
            "case": case,
            "consent": consent,
            "messages": messages,
            "prescriptions": prescriptions,
        }
    except HTTPException:
        raise
    except RuntimeError as e:
        raise HTTPException(503, str(e))


# ── Case State Transitions ───────────────────────────────────────────────

@app.post("/api/cases/{case_id}/assign")
def assign_case_endpoint(case_id: str, req: CaseStatusRequest):
    """Assign a case to a doctor (requested → assigned)."""
    try:
        case = assign_case(case_id, req.doctor_id)
        return {"case": case}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@app.post("/api/cases/{case_id}/accept")
def accept_case_endpoint(case_id: str):
    """Doctor accepts a case (assigned → accepted)."""
    try:
        return {"case": accept_case(case_id)}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/cases/{case_id}/start")
def start_case_endpoint(case_id: str):
    """Doctor starts consultation (accepted → in_progress)."""
    try:
        return {"case": start_case(case_id)}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/cases/{case_id}/complete")
def complete_case_endpoint(case_id: str):
    """Mark case as completed (in_progress → completed)."""
    try:
        return {"case": complete_case(case_id)}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/cases/{case_id}/close")
def close_case_endpoint(case_id: str):
    """Close a case from any state."""
    try:
        return {"case": close_case(case_id)}
    except ValueError as e:
        raise HTTPException(400, str(e))


# ── Doctor-Patient Messaging ─────────────────────────────────────────────

@app.post("/api/cases/{case_id}/messages")
def post_message(case_id: str, req: SendMessageRequest):
    """Send a message in a case thread."""
    try:
        msg = send_message(case_id, req.sender_id, req.sender_type, req.message)
        return {"message": msg}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@app.get("/api/cases/{case_id}/messages")
def get_case_messages(case_id: str):
    """Get all messages for a case."""
    try:
        return {"messages": get_messages(case_id)}
    except RuntimeError as e:
        raise HTTPException(503, str(e))


# ── Prescriptions ────────────────────────────────────────────────────────

@app.post("/api/prescriptions")
def create_new_prescription(req: PrescriptionRequest):
    """Doctor writes a structured prescription for a case."""
    try:
        rx = create_prescription(
            case_id=req.case_id,
            doctor_id=req.doctor_id,
            patient_id=req.patient_id,
            diagnosis=req.diagnosis,
            medications=req.medications,
            instructions=req.instructions,
            follow_up_date=req.follow_up_date,
        )
        return {"prescription": rx}
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/prescriptions/case/{case_id}")
def get_case_prescriptions(case_id: str):
    return {"prescriptions": get_prescriptions_for_case(case_id)}


@app.get("/api/prescriptions/patient/{patient_id}")
def get_patient_prescriptions(patient_id: str):
    return {"prescriptions": get_prescriptions_for_patient(patient_id)}


# ── Consent Management ───────────────────────────────────────────────────

@app.post("/api/consent/revoke")
def revoke_consent_endpoint(req: ConsentRevokeRequest):
    """Revoke a previously granted consent."""
    try:
        revoke_consent(req.consent_id)
        return {"revoked": True}
    except RuntimeError as e:
        raise HTTPException(503, str(e))


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
