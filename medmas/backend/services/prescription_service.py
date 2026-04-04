"""Structured prescription CRUD for doctor consultations."""
from config import supabase_db


def _check_supabase():
    if not supabase_db:
        raise RuntimeError("Supabase not configured")


def create_prescription(
    case_id: str,
    doctor_id: str,
    patient_id: str,
    diagnosis: str = "",
    medications: list | None = None,
    instructions: str = "",
    follow_up_date: str | None = None,
) -> dict:
    """Create a structured prescription for a case.

    medications format: [{"name": "...", "dosage": "...", "frequency": "...", "duration": "..."}]
    """
    _check_supabase()
    row = {
        "case_id":     case_id,
        "doctor_id":   doctor_id,
        "patient_id":  patient_id,
        "diagnosis":   diagnosis,
        "medications": medications or [],
        "instructions": instructions,
    }
    if follow_up_date:
        row["follow_up_date"] = follow_up_date
    result = supabase_db.table("prescriptions").insert(row).execute()
    return result.data[0] if result.data else {}


def get_prescription(prescription_id: str) -> dict | None:
    _check_supabase()
    result = (
        supabase_db.table("prescriptions")
        .select("*")
        .eq("id", prescription_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def get_prescriptions_for_case(case_id: str) -> list:
    _check_supabase()
    result = (
        supabase_db.table("prescriptions")
        .select("*")
        .eq("case_id", case_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def get_prescriptions_for_patient(patient_id: str) -> list:
    _check_supabase()
    result = (
        supabase_db.table("prescriptions")
        .select("*")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []
