"""Case management: creation, state machine, consent, doctor-patient messaging."""
from datetime import datetime, timezone

from config import supabase_db

VALID_STATUSES = ("requested", "assigned", "accepted", "in_progress", "completed", "closed")
VALID_TRANSITIONS = {
    "requested":   ("assigned", "closed"),
    "assigned":    ("accepted", "closed"),
    "accepted":    ("in_progress", "closed"),
    "in_progress": ("completed", "closed"),
    "completed":   ("closed",),
    "closed":      (),
}


def _check_supabase():
    if not supabase_db:
        raise RuntimeError("Supabase not configured")


# ── Consent ───────────────────────────────────────────────────────────────

def grant_consent(
    user_id: str,
    case_id: str,
    doctor_id: str | None = None,
    scope: list | None = None,
) -> dict:
    """Record explicit user consent for a case."""
    _check_supabase()
    result = supabase_db.table("consents").insert({
        "user_id":   user_id,
        "case_id":   case_id,
        "doctor_id": doctor_id,
        "scope":     scope or ["chat"],
        "active":    True,
    }).execute()
    return result.data[0] if result.data else {}


def revoke_consent(consent_id: str) -> None:
    """Revoke a previously granted consent."""
    _check_supabase()
    now = datetime.now(timezone.utc).isoformat()
    supabase_db.table("consents").update({
        "active": False,
        "revoked_at": now,
    }).eq("id", consent_id).execute()


def get_consent_for_case(case_id: str) -> dict | None:
    _check_supabase()
    result = (
        supabase_db.table("consents")
        .select("*")
        .eq("case_id", case_id)
        .eq("active", True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


# ── Case CRUD ─────────────────────────────────────────────────────────────

def create_case(
    user_id: str,
    session_id: str | None = None,
    symptoms_summary: str = "",
    ai_suggestion: str = "",
    triage_level: str = "routine",
    specialty_needed: str = "General",
    district: str = "",
) -> dict:
    """Create a new consultation case from a chat session."""
    _check_supabase()
    now = datetime.now(timezone.utc).isoformat()
    result = supabase_db.table("cases").insert({
        "user_id":          user_id,
        "session_id":       session_id,
        "status":           "requested",
        "symptoms_summary": symptoms_summary,
        "ai_suggestion":    ai_suggestion,
        "triage_level":     triage_level,
        "specialty_needed": specialty_needed,
        "district":         district,
        "created_at":       now,
        "updated_at":       now,
    }).execute()
    return result.data[0] if result.data else {}


def get_case(case_id: str) -> dict | None:
    _check_supabase()
    result = (
        supabase_db.table("cases")
        .select("*")
        .eq("id", case_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def list_cases_for_user(user_id: str) -> list:
    _check_supabase()
    result = (
        supabase_db.table("cases")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def list_cases_for_session(user_id: str, session_id: str) -> list:
    """Cases created from a specific chat session for a patient."""
    _check_supabase()
    result = (
        supabase_db.table("cases")
        .select("*")
        .eq("user_id", user_id)
        .eq("session_id", session_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data or []


def list_cases_for_doctor(doctor_id: str) -> list:
    """Cases assigned to a doctor — the doctor's queue."""
    _check_supabase()
    result = (
        supabase_db.table("cases")
        .select("*")
        .eq("doctor_id", doctor_id)
        .neq("status", "closed")
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data or []


def list_closed_cases_for_doctor(doctor_id: str) -> list:
    """Closed cases for a doctor — history view."""
    _check_supabase()
    result = (
        supabase_db.table("cases")
        .select("*")
        .eq("doctor_id", doctor_id)
        .eq("status", "closed")
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data or []


def list_unassigned_cases(specialty: str = "", district: str = "") -> list:
    """Cases waiting to be assigned (status = requested)."""
    _check_supabase()
    query = (
        supabase_db.table("cases")
        .select("*")
        .eq("status", "requested")
    )
    if specialty:
        query = query.ilike("specialty_needed", f"%{specialty}%")
    if district:
        query = query.ilike("district", f"%{district}%")
    result = query.order("created_at").execute()
    return result.data or []


# ── State Machine ─────────────────────────────────────────────────────────

def update_case_status(case_id: str, new_status: str, doctor_id: str | None = None) -> dict:
    """Transition a case to a new status with validation."""
    if new_status not in VALID_STATUSES:
        raise ValueError(f"Invalid status: {new_status}")

    case = get_case(case_id)
    if not case:
        raise ValueError("Case not found")

    current = case["status"]
    if new_status not in VALID_TRANSITIONS.get(current, ()):
        raise ValueError(f"Cannot transition from '{current}' to '{new_status}'")

    _check_supabase()
    now = datetime.now(timezone.utc).isoformat()
    update_data = {"status": new_status, "updated_at": now}
    if doctor_id and new_status == "assigned":
        update_data["doctor_id"] = doctor_id

    result = (
        supabase_db.table("cases")
        .update(update_data)
        .eq("id", case_id)
        .execute()
    )
    return result.data[0] if result.data else {}


def assign_case(case_id: str, doctor_id: str) -> dict:
    """Assign a case to a doctor (requested → assigned)."""
    return update_case_status(case_id, "assigned", doctor_id=doctor_id)


def accept_case(case_id: str) -> dict:
    """Doctor accepts a case (assigned → accepted)."""
    return update_case_status(case_id, "accepted")


def start_case(case_id: str) -> dict:
    """Doctor starts working (accepted → in_progress)."""
    return update_case_status(case_id, "in_progress")


def complete_case(case_id: str) -> dict:
    """Mark case complete (in_progress → completed)."""
    return update_case_status(case_id, "completed")


def close_case(case_id: str) -> dict:
    """Close case from any state."""
    case = get_case(case_id)
    if not case:
        raise ValueError("Case not found")
    _check_supabase()
    now = datetime.now(timezone.utc).isoformat()
    result = (
        supabase_db.table("cases")
        .update({"status": "closed", "updated_at": now})
        .eq("id", case_id)
        .execute()
    )
    return result.data[0] if result.data else {}


# ── Doctor-Patient Messaging ──────────────────────────────────────────────

def send_message(case_id: str, sender_id: str, sender_type: str, message: str) -> dict:
    """Send a message in a case thread."""
    if sender_type not in ("doctor", "patient"):
        raise ValueError("sender_type must be 'doctor' or 'patient'")
    _check_supabase()
    result = supabase_db.table("doctor_messages").insert({
        "case_id":     case_id,
        "sender_id":   sender_id,
        "sender_type": sender_type,
        "message":     message,
    }).execute()
    return result.data[0] if result.data else {}


def get_messages(case_id: str) -> list:
    """Get all messages for a case, ordered chronologically."""
    _check_supabase()
    result = (
        supabase_db.table("doctor_messages")
        .select("*")
        .eq("case_id", case_id)
        .order("created_at")
        .execute()
    )
    return result.data or []
