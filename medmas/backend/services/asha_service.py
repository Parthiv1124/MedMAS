# backend/services/asha_service.py
"""Supabase operations for ASHA worker patient queue management."""
from config import supabase


def _check_supabase():
    if not supabase:
        raise RuntimeError("Supabase not configured — set SUPABASE_URL and SUPABASE_ANON_KEY in .env")


def get_patient_queue(asha_worker_id: str) -> list:
    """Fetch active patients assigned to an ASHA worker, ordered by priority."""
    _check_supabase()
    result = (
        supabase.table("asha_patients")
        .select("*")
        .eq("asha_worker_id", asha_worker_id)
        .eq("status", "active")
        .order("priority", desc=True)
        .execute()
    )
    return result.data


def add_patient(asha_worker_id: str, name: str, age: int, gender: str,
                village: str, district: str, priority: int = 1,
                notes: str = "") -> dict:
    """Add a new patient to the ASHA worker's queue."""
    _check_supabase()
    result = supabase.table("asha_patients").insert({
        "asha_worker_id": asha_worker_id,
        "name":           name,
        "age":            age,
        "gender":         gender,
        "village":        village,
        "district":       district,
        "priority":       priority,
        "notes":          notes,
        "status":         "active",
    }).execute()
    return result.data[0] if result.data else {}


def save_field_assessment(patient_id: str, asha_worker_id: str,
                           asha_result: dict) -> bool:
    """Save completed field assessment to Supabase."""
    if not supabase:
        print("[ASHA Service] Supabase not configured — skipping save")
        return False
    try:
        supabase.table("asha_assessments").insert({
            "patient_id":       patient_id,
            "asha_worker_id":   asha_worker_id,
            "triage_decision":  asha_result.get("triage_decision"),
            "refer_to":         asha_result.get("refer_to"),
            "documentation":    asha_result.get("documentation"),
            "danger_signs":     asha_result.get("danger_signs"),
        }).execute()
        return True
    except Exception as e:
        print(f"[ASHA Service] Save failed: {e}")
        return False


def update_patient_status(patient_id: str, status: str):
    """Update patient status: active | referred | resolved."""
    if not supabase:
        return
    supabase.table("asha_patients").update(
        {"status": status}
    ).eq("id", patient_id).execute()


def get_assessment_history(patient_id: str) -> list:
    """Get all assessments for a patient."""
    _check_supabase()
    result = (
        supabase.table("asha_assessments")
        .select("*")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data
