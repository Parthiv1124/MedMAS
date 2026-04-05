"""Supabase operations for doctor registration and lookup."""
from config import supabase_db

ALLOWED_STATUSES = {"pending", "verified", "rejected"}


def _check_supabase():
    if not supabase_db:
        raise RuntimeError("Supabase not configured — set SUPABASE_URL and keys in .env")


def register_doctor(
    user_id: str,
    name: str,
    email: str,
    phone: str,
    specialty: str = "General",
    license_number: str = "",
    district: str = "",
    bio: str = "",
) -> dict:
    """Register a new doctor profile linked to an auth user."""
    _check_supabase()
    # First check if a doctor profile already exists for this user
    existing = (
        supabase_db.table("doctors")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]

    result = supabase_db.table("doctors").insert({
        "user_id":        user_id,
        "name":           name,
        "email":          email,
        "phone":          phone,
        "specialty":      specialty,
        "license_number": license_number,
        "district":       district,
        "bio":            bio,
        "status":         "verified",
    }).execute()
    return result.data[0] if result.data else {}


def get_doctor_by_user_id(user_id: str) -> dict | None:
    """Look up doctor profile by their auth user ID."""
    _check_supabase()
    result = (
        supabase_db.table("doctors")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def get_doctor_by_id(doctor_id: str) -> dict | None:
    """Look up doctor profile by doctor table ID."""
    _check_supabase()
    result = (
        supabase_db.table("doctors")
        .select("*")
        .eq("id", doctor_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def list_doctors(specialty: str = "", district: str = "", verified_only: bool = True) -> list:
    """List doctors, optionally filtered by specialty and district."""
    _check_supabase()
    query = supabase_db.table("doctors").select("*")
    if verified_only:
        query = query.eq("status", "verified")
    if specialty:
        query = query.ilike("specialty", f"%{specialty}%")
    if district:
        query = query.ilike("district", f"%{district}%")
    result = query.order("name").execute()
    return result.data or []


def update_doctor_status(doctor_id: str, status: str) -> dict:
    """Update doctor verification status: pending | verified | rejected."""
    if status not in ALLOWED_STATUSES:
        raise ValueError(f"Status must be one of: {ALLOWED_STATUSES}")
    _check_supabase()
    result = (
        supabase_db.table("doctors")
        .update({"status": status})
        .eq("id", doctor_id)
        .execute()
    )
    return result.data[0] if result.data else {}


def match_doctors(specialty: str = "General", district: str = "", limit: int = 5) -> list:
    """Simple doctor matching: filter by specialty + district, return top matches."""
    _check_supabase()
    query = (
        supabase_db.table("doctors")
        .select("*")
        .eq("status", "verified")
    )
    if specialty:
        query = query.ilike("specialty", f"%{specialty}%")
    if district:
        query = query.ilike("district", f"%{district}%")
    result = query.limit(limit).execute()
    doctors = result.data or []

    # If no match with district, broaden to just specialty
    if not doctors and district:
        result = (
            supabase_db.table("doctors")
            .select("*")
            .eq("status", "verified")
            .ilike("specialty", f"%{specialty}%")
            .limit(limit)
            .execute()
        )
        doctors = result.data or []

    return doctors
