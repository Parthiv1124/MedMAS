# backend/agents/symptom_checker_v2.py
"""
Agent 1: Symptom Checker

This version keeps the outer LangGraph contract stable while improving the
internal architecture into a small pipeline:

1. Symptom structuring
2. Deterministic red-flag detection
3. Targeted retrieval
4. Differential diagnosis reasoning
5. Triage and advice synthesis
"""

from typing import Any, Dict, List

from langchain_qdrant import QdrantVectorStore
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser

from config import llm, QDRANT_URL, QDRANT_API_KEY, QDRANT_COLLECTION, create_embeddings
from services.doctor_finder import find_doctors
from state import MedMASState

STRUCTURE_PROMPT = """You are the symptom structuring layer for a rural India medical triage system.
Read the user's symptom description and return ONLY valid JSON with this schema:
{{
  "primary_symptoms": ["main symptom", "main symptom"],
  "associated_symptoms": ["supporting symptom"],
  "duration": "short phrase or unknown",
  "severity": "mild|moderate|severe|unknown",
  "body_site": "body location or unknown",
  "risk_factors": ["pregnancy", "diabetes", "elderly", "child", "hypertension"],
  "missing_critical_info": ["important missing question"],
  "retrieval_domain": "general|respiratory|cardiac|neurological|gastrointestinal|endocrine|maternal_child|mental_health"
}}
Rules:
- Keep fields short and literal.
- Use "unknown" if not stated.
- Do not diagnose.
- Include only information supported by the user's text.
"""

DIFFERENTIAL_PROMPT = """You are the differential diagnosis layer for a rural India medical triage system.
Given structured symptoms and retrieved medical context, return ONLY valid JSON in this schema:
{{
  "diagnoses": [
    {{"condition": "...", "likelihood": "high|medium|low", "reason": "one sentence"}},
    {{"condition": "...", "likelihood": "high|medium|low", "reason": "one sentence"}},
    {{"condition": "...", "likelihood": "high|medium|low", "reason": "one sentence"}}
  ],
  "recommended_specialty": "General|Cardiology|Neurology|Endocrinology|Psychiatry|Paediatrics|Obstetrics",
  "follow_up_questions": ["important clarifying question"],
  "confidence_summary": "low|medium|high"
}}
Rules:
- Always return exactly 3 diagnoses.
- Never give a definitive diagnosis.
- Prefer common Indian presentations over rare exotic disease explanations.
- Keep reasons concise and symptom-linked.
- Specialty should reflect the best referral path, not necessarily the most severe disease.
"""

TRIAGE_PRIORITY = {"routine": 0, "moderate": 1, "urgent": 2}
LIKELIHOOD_TO_CONFIDENCE = {"low": 0.35, "medium": 0.6, "high": 0.82}
ALLOWED_SPECIALTIES = {
    "General",
    "Cardiology",
    "Neurology",
    "Endocrinology",
    "Psychiatry",
    "Paediatrics",
    "Obstetrics",
}

RED_FLAG_RULES = [
    {
        "name": "chest pain or pressure",
        "keywords": ["chest pain", "chest pressure", "tightness in chest"],
        "triage": "urgent",
        "specialty": "Cardiology",
    },
    {
        "name": "shortness of breath",
        "keywords": ["shortness of breath", "breathlessness", "difficulty breathing", "can't breathe"],
        "triage": "urgent",
        "specialty": "General",
    },
    {
        "name": "stroke-like symptoms",
        "keywords": ["one sided weakness", "slurred speech", "facial droop", "sudden confusion"],
        "triage": "urgent",
        "specialty": "Neurology",
    },
    {
        "name": "loss of consciousness or seizure",
        "keywords": ["seizure", "convulsion", "unconscious", "passed out", "fainted"],
        "triage": "urgent",
        "specialty": "Neurology",
    },
    {
        "name": "pregnancy danger signs",
        "keywords": ["pregnant bleeding", "bleeding in pregnancy", "pregnant with severe headache", "pregnant with swelling"],
        "triage": "urgent",
        "specialty": "Obstetrics",
    },
    {
        "name": "blood in vomit or sputum",
        "keywords": ["vomiting blood", "blood in sputum", "coughing blood"],
        "triage": "urgent",
        "specialty": "General",
    },
]

_embeddings = create_embeddings()
_qdrant_store = None
_retriever = None


def _get_retriever():
    global _qdrant_store, _retriever
    if _retriever is None:
        _qdrant_store = QdrantVectorStore.from_existing_collection(
            embedding=_embeddings,
            url=QDRANT_URL,
            api_key=QDRANT_API_KEY,
            collection_name=QDRANT_COLLECTION,
        )
        _retriever = _qdrant_store.as_retriever(search_kwargs={"k": 5})
    return _retriever


def _safe_invoke_json(prompt_text: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    prompt = ChatPromptTemplate.from_messages([
        ("system", prompt_text),
        ("human", "{payload}"),
    ])
    chain = prompt | llm | JsonOutputParser()
    return chain.invoke({"payload": str(payload)})


def _normalize_list(items: Any) -> List[str]:
    if not isinstance(items, list):
        return []
    normalized = []
    for item in items:
        text = str(item).strip()
        if text:
            normalized.append(text)
    return normalized


def _structure_symptoms(raw_text: str) -> Dict[str, Any]:
    try:
        result = _safe_invoke_json(STRUCTURE_PROMPT, {"user_text": raw_text})
    except Exception as e:
        print(f"[SymptomChecker] Structuring failed: {e}")
        result = {}

    primary = _normalize_list(result.get("primary_symptoms"))
    associated = _normalize_list(result.get("associated_symptoms"))
    risk_factors = _normalize_list(result.get("risk_factors"))
    missing = _normalize_list(result.get("missing_critical_info"))
    retrieval_domain = str(result.get("retrieval_domain") or "general").strip() or "general"

    if retrieval_domain not in {
        "general",
        "respiratory",
        "cardiac",
        "neurological",
        "gastrointestinal",
        "endocrine",
        "maternal_child",
        "mental_health",
    }:
        retrieval_domain = "general"

    if not primary:
        primary = [raw_text[:120].strip() or "symptom complaint"]

    severity = str(result.get("severity") or "unknown").strip().lower()
    if severity not in {"mild", "moderate", "severe", "unknown"}:
        severity = "unknown"

    return {
        "primary_symptoms": primary[:4],
        "associated_symptoms": associated[:6],
        "duration": str(result.get("duration") or "unknown").strip() or "unknown",
        "severity": severity,
        "body_site": str(result.get("body_site") or "unknown").strip() or "unknown",
        "risk_factors": risk_factors[:5],
        "missing_critical_info": missing[:5],
        "retrieval_domain": retrieval_domain,
    }


def _detect_red_flags(raw_text: str, structured: Dict[str, Any]) -> Dict[str, Any]:
    haystack_parts = [
        raw_text.lower(),
        " ".join(structured.get("primary_symptoms", [])).lower(),
        " ".join(structured.get("associated_symptoms", [])).lower(),
        " ".join(structured.get("risk_factors", [])).lower(),
    ]
    haystack = " ".join(part for part in haystack_parts if part)

    detected = []
    suggested_specialty = None
    triage = "routine"
    for rule in RED_FLAG_RULES:
        if any(keyword in haystack for keyword in rule["keywords"]):
            detected.append(rule["name"])
            if TRIAGE_PRIORITY[rule["triage"]] > TRIAGE_PRIORITY[triage]:
                triage = rule["triage"]
                suggested_specialty = rule["specialty"]

    severity = structured.get("severity", "unknown")
    if severity == "severe" and triage != "urgent":
        triage = "moderate"

    return {
        "detected": bool(detected),
        "items": detected,
        "triage_floor": triage,
        "suggested_specialty": suggested_specialty,
        "reason": "deterministic red-flag match" if detected else "",
    }


def _build_retrieval_query(structured: Dict[str, Any], raw_text: str) -> str:
    parts = [
        f"Domain: {structured.get('retrieval_domain', 'general')}",
        f"Primary: {', '.join(structured.get('primary_symptoms', []))}",
        f"Associated: {', '.join(structured.get('associated_symptoms', []))}",
        f"Duration: {structured.get('duration', 'unknown')}",
        f"Severity: {structured.get('severity', 'unknown')}",
        f"Risk factors: {', '.join(structured.get('risk_factors', []))}",
        f"User text: {raw_text}",
    ]
    return "\n".join(parts)


def _retrieve_context(raw_text: str, structured: Dict[str, Any]) -> str:
    try:
        retriever = _get_retriever()
        query = _build_retrieval_query(structured, raw_text)
        docs = retriever.get_relevant_documents(query)
        return "\n".join(d.page_content for d in docs)
    except Exception as e:
        print(f"[SymptomChecker] Qdrant retrieval failed: {e}")
        return ""


def _reason_differentials(raw_text: str, structured: Dict[str, Any], context: str) -> Dict[str, Any]:
    payload = {
        "user_text": raw_text,
        "structured_symptoms": structured,
        "medical_context": context,
    }
    try:
        result = _safe_invoke_json(DIFFERENTIAL_PROMPT, payload)
    except Exception as e:
        print(f"[SymptomChecker] Differential reasoning failed: {e}")
        result = {}

    diagnoses = result.get("diagnoses")
    if not isinstance(diagnoses, list) or len(diagnoses) != 3:
        primary = structured.get("primary_symptoms", ["symptoms"])
        diagnoses = [
            {
                "condition": "Common infectious illness",
                "likelihood": "medium",
                "reason": f"Based on reported symptoms such as {primary[0]}.",
            },
            {
                "condition": "Needs clinical evaluation",
                "likelihood": "medium",
                "reason": "Symptoms need a doctor review for a clearer diagnosis.",
            },
            {
                "condition": "Supportive care condition",
                "likelihood": "low",
                "reason": "Some symptom patterns may improve with monitoring and fluids.",
            },
        ]

    normalized_diagnoses = []
    for diagnosis in diagnoses[:3]:
        condition = str(diagnosis.get("condition") or "Unclear condition").strip()
        likelihood = str(diagnosis.get("likelihood") or "low").strip().lower()
        if likelihood not in LIKELIHOOD_TO_CONFIDENCE:
            likelihood = "low"
        reason = str(diagnosis.get("reason") or "Symptom pattern is incomplete.").strip()
        normalized_diagnoses.append(
            {"condition": condition, "likelihood": likelihood, "reason": reason}
        )

    specialty = str(result.get("recommended_specialty") or "General").strip()
    if specialty not in ALLOWED_SPECIALTIES:
        specialty = "General"

    confidence_summary = str(result.get("confidence_summary") or "medium").strip().lower()
    if confidence_summary not in {"low", "medium", "high"}:
        confidence_summary = "medium"

    return {
        "diagnoses": normalized_diagnoses,
        "recommended_specialty": specialty,
        "follow_up_questions": _normalize_list(result.get("follow_up_questions"))[:4],
        "confidence_summary": confidence_summary,
    }


def _synthesize_triage(structured: Dict[str, Any], red_flags: Dict[str, Any], differentials: Dict[str, Any]) -> Dict[str, Any]:
    triage = red_flags.get("triage_floor", "routine")
    severity = structured.get("severity", "unknown")
    duration = structured.get("duration", "unknown").lower()

    if triage != "urgent":
        if severity == "severe":
            triage = "moderate"
        if any(token in duration for token in ("week", "weeks", "month", "months", "persistent", "long")):
            triage = max(triage, "moderate", key=lambda level: TRIAGE_PRIORITY[level])

    diagnoses = differentials.get("diagnoses", [])
    confidence_values = [
        LIKELIHOOD_TO_CONFIDENCE.get(diagnosis.get("likelihood", "low"), 0.35)
        for diagnosis in diagnoses
    ]
    diagnosis_confidence = round(max(confidence_values), 2) if confidence_values else 0.35

    specialty = differentials.get("recommended_specialty", "General")
    if red_flags.get("suggested_specialty"):
        specialty = red_flags["suggested_specialty"]

    if triage == "urgent":
        next_steps = (
            "Please seek care within 6 hours, or immediately if symptoms worsen. "
            "Do not rely only on home treatment for this symptom pattern."
        )
    elif triage == "moderate":
        next_steps = (
            "Please arrange a doctor consultation within 24 to 48 hours. "
            "Monitor symptoms closely and seek urgent care if red-flag symptoms appear."
        )
    else:
        next_steps = (
            "This pattern appears suitable for routine medical review and symptom monitoring. "
            "If new severe symptoms appear, seek medical care earlier."
        )

    return {
        "triage_level": triage,
        "recommended_specialty": specialty,
        "next_steps": next_steps,
        "diagnosis_confidence": diagnosis_confidence,
        "triage_reason": red_flags.get("reason") or f"severity={severity}, duration={structured.get('duration', 'unknown')}",
    }


def symptom_checker_node(state: MedMASState) -> dict:
    """LangGraph node: structured symptom triage via extraction, RAG, and synthesis."""
    symptoms = state["translated_input"]

    # Prepend prior symptom turns so the LLM understands follow-up context
    history = state.get("session_history") or []
    if history:
        prior = "\n".join(
            f"{'User' if t.get('role') == 'user' else 'Assistant'}: {t.get('content', '')}"
            for t in history[-(8):]
        )
        enriched = f"Previous conversation:\n{prior}\n\nCurrent message: {symptoms}"
    else:
        enriched = symptoms

    structured = _structure_symptoms(enriched)
    red_flags = _detect_red_flags(enriched, structured)
    context = _retrieve_context(enriched, structured)
    differentials = _reason_differentials(enriched, structured, context)
    triage = _synthesize_triage(structured, red_flags, differentials)

    result = {
        "structured_symptoms": structured,
        "red_flag_analysis": red_flags,
        "follow_up_questions": differentials.get("follow_up_questions", []),
        "confidence_summary": differentials.get("confidence_summary", "medium"),
        "diagnosis_confidence": triage["diagnosis_confidence"],
        "triage_reason": triage["triage_reason"],
        "diagnoses": differentials["diagnoses"],
        "triage_level": triage["triage_level"],
        "recommended_specialty": triage["recommended_specialty"],
        "red_flags": red_flags.get("items", []),
        "next_steps": triage["next_steps"],
    }

    doctors = find_doctors(
        specialty=result.get("recommended_specialty", "General"),
        district=state.get("user_district") or "",
    )

    return {
        "symptom_result": result,
        "triage_level": result.get("triage_level", "routine"),
        "doctor_list": doctors,
    }
