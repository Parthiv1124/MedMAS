# backend/state.py
from typing import TypedDict, Optional, List, Dict, Any


class MedMASState(TypedDict):
    # ── Input ──────────────────────────────────────────────────────────
    raw_input:        str            # Original user text / voice transcript
    input_lang:       str            # Detected language code e.g. "hi", "ta"
    translated_input: str            # English version for all agent processing
    media_type:       str            # "text" | "pdf" | "voice"
    pdf_bytes:        Optional[bytes]
    user_id:          Optional[str]
    user_district:    Optional[str]
    user_phone:       Optional[str]
    user_lat:         Optional[float]
    user_lng:         Optional[float]

    # ── Safety — Global Crisis Guard ───────────────────────────────────
    crisis_detected:       bool
    crisis_keywords_found: List[str]

    # ── Orchestration ──────────────────────────────────────────────────
    intent:              str         # "symptom"|"lab"|"mental"|"lifestyle"|"asha"|"doctor"|"reminder"
    agents_to_run:       List[str]
    routing_confidence:  float       # 0.0–1.0

    # ── Cross-Agent Session Memory ─────────────────────────────────────
    session_context:  Dict[str, Any] # Accumulated findings from all agents
    session_history:  List[Dict]     # Full turn-by-turn history for multi-turn

    # ── Agent Outputs ──────────────────────────────────────────────────
    symptom_result:  Optional[Dict[str, Any]]
    disease_result:  Optional[Dict[str, Any]]
    empathy_result:  Optional[Dict[str, Any]]
    health_result:   Optional[Dict[str, Any]]
    asha_result:     Optional[Dict[str, Any]]   # Agent 6
    offtopic_result: Optional[Dict[str, Any]]   # Guardrail: non-medical queries
    doctor_list:     Optional[List[Dict[str, Any]]]
    hint_intent:     Optional[str]

    # ── ASHA Worker Mode (Agent 6) ─────────────────────────────────────
    asha_mode:       bool
    asha_worker_id:  Optional[str]
    patient_id:      Optional[str]

    # ── Final Output ───────────────────────────────────────────────────
    aggregated_response: str
    final_response:      str         # Back-translated to user language
    triage_level:        str         # "urgent" | "moderate" | "routine"
    error:               Optional[str]
    translation_failed:  bool         # Flag for unsupported language fallback


def initial_state(
    raw_input:      str,
    media_type:     str           = "text",
    pdf_bytes:      bytes         = None,
    user_id:        str           = None,
    user_district:  str           = None,
    user_phone:     str           = None,
    user_lat:       float         = None,
    user_lng:       float         = None,
    asha_mode:      bool          = False,
    asha_worker_id: str           = None,
    patient_id:     str           = None,
    session_context: dict         = None,
    session_history: list         = None,
    hint_intent:     str           = None,
) -> MedMASState:
    """Create a fresh MedMASState for a new request."""
    return MedMASState(
        raw_input=raw_input,
        input_lang="en",
        translated_input="",
        media_type=media_type,
        pdf_bytes=pdf_bytes,
        user_id=user_id,
        user_district=user_district,
        user_phone=user_phone,
        user_lat=user_lat,
        user_lng=user_lng,
        crisis_detected=False,
        crisis_keywords_found=[],
        intent="",
        agents_to_run=[],
        routing_confidence=0.0,
        session_context=session_context or {},
        session_history=session_history or [],
        symptom_result=None,
        disease_result=None,
        empathy_result=None,
        health_result=None,
        asha_result=None,
        offtopic_result=None,
        doctor_list=None,
        hint_intent=None,
        asha_mode=asha_mode,
        asha_worker_id=asha_worker_id,
        patient_id=patient_id,
        aggregated_response="",
        final_response="",
        triage_level="routine",
        error=None,
        translation_failed=False,
    )
