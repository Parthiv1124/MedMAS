# backend/orchestrator.py
from langgraph.graph import StateGraph, END
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from state import MedMASState, initial_state
from config import llm
from agents.crisis_guard    import crisis_guard_node
from agents.multilingual    import language_detector_node, multilingual_output_node
from agents.symptom_checker import symptom_checker_node
from agents.disease_predictor import disease_predictor_node
from agents.empathy_chatbot import empathy_chatbot_node
from agents.health_scorer   import health_scorer_node
from agents.asha_copilot    import asha_copilot_node
from services.doctor_finder import find_doctors
from services.osm_doctor_finder import find_nearby_doctors

DOCTOR_REFERRAL_FOOTER = (
    "\n\n---\n"
    "IMPORTANT: This information is for guidance only. "
    "Always consult a qualified doctor before acting on any health information. "
    "In an emergency, call 112."
)

# ── Intent Classifier ──────────────────────────────────────────────────────
INTENT_PROMPT = """Classify this query into exactly one category.

Categories: symptom | lab | mental | lifestyle | asha | doctor | reminder | offtopic

symptom   - user describes physical symptoms or asks about a condition
lab       - user uploads or mentions lab report values (HbA1c, BP, glucose, etc.)
mental    - user mentions stress, anxiety, depression, sleep issues, emotional distress
lifestyle - user asks about diet, exercise, health score, habits, prevention
asha      - ASHA worker submitting patient field observations for triage
doctor    - user wants to find a doctor or specialist
reminder  - user wants to set a medication or checkup reminder
offtopic  - NOT related to health/medical/wellness at all (e.g. sports, politics, weather, math, jokes, coding, general chitchat, greetings like "hi" or "hello")

IMPORTANT: Only classify as offtopic if the query has absolutely NO connection to health, medicine, wellness, symptoms, mental health, or lifestyle. When in doubt, prefer a medical category.

Query: {query}

Respond with ONLY the category label, nothing else."""

def intent_classifier_node(state: MedMASState) -> dict:
    # If crisis guard already set intent, respect it
    if state.get("crisis_detected") and state.get("intent") == "mental":
        return {"intent": "mental", "agents_to_run": ["empathy_chatbot"]}

    # If ASHA mode forced intent, respect it
    if state.get("asha_mode") and state.get("intent") == "asha":
        return {"intent": "asha", "agents_to_run": ["asha_copilot"]}

    prompt  = ChatPromptTemplate.from_template(INTENT_PROMPT)
    chain   = prompt | llm | StrOutputParser()
    intent  = chain.invoke({"query": state["translated_input"]}).strip().lower()

    agent_map = {
        "symptom":   ["symptom_checker"],
        "lab":       ["disease_predictor"],
        "mental":    ["empathy_chatbot"],
        "lifestyle": ["health_scorer"],
        "asha":      ["asha_copilot"],
        "doctor":    ["symptom_checker"],
        "reminder":  ["health_scorer"],
        "offtopic":  ["offtopic_responder"],
    }
    agents = agent_map.get(intent, ["symptom_checker"])
    return {"intent": intent, "agents_to_run": agents}

def route_by_intent(state: MedMASState) -> str:
    route_map = {
        "symptom":   "symptom_checker",
        "doctor":    "symptom_checker",
        "lab":       "disease_predictor",
        "mental":    "empathy_chatbot",
        "lifestyle": "health_scorer",
        "reminder":  "health_scorer",
        "asha":      "asha_copilot",
        "offtopic":  "offtopic_responder",
    }
    return route_map.get(state.get("intent", "symptom"), "symptom_checker")

# ── Off-Topic Guardrail Node ───────────────────────────────────────────────
OFFTOPIC_PROMPT = """You are MedMAS, a Multi-Agent AI Health System for rural India.
The user asked something unrelated to health or medicine.

User query: {query}

Respond politely and helpfully in 2-3 sentences:
1. Greet them warmly if it's a greeting, or acknowledge their question.
2. Gently let them know you're a health assistant and can't help with that topic.
3. Suggest what they CAN ask you about (symptoms, lab reports, mental health, lifestyle, health score).

Keep it friendly, warm, and encouraging. Do NOT be rude or dismissive.
If the user said "hi" or "hello", welcome them and tell them what you can do.
Respond in the same language the user used if possible."""

def offtopic_responder_node(state: MedMASState) -> dict:
    """Handles non-medical queries with a friendly redirect."""
    prompt = ChatPromptTemplate.from_template(OFFTOPIC_PROMPT)
    chain  = prompt | llm | StrOutputParser()
    try:
        response = chain.invoke({"query": state["translated_input"]})
    except Exception:
        response = (
            "Hello! I'm MedMAS, your AI health assistant for rural India. "
            "I can help you with symptoms, lab reports, mental health support, "
            "lifestyle health scores, and more. How can I help with your health today?"
        )
    return {"offtopic_result": {"response": response}}

# ── Session Memory Node ────────────────────────────────────────────────────
def session_memory_node(state: MedMASState) -> dict:
    """Accumulates all agent findings into session_context for cross-agent synthesis."""
    ctx = dict(state.get("session_context") or {})

    if state.get("symptom_result"):
        diagnoses = state["symptom_result"].get("diagnoses", [])
        ctx["top_condition"] = diagnoses[0].get("condition") if diagnoses else None
        ctx["symptom_triage"] = state["symptom_result"].get("triage_level")

    if state.get("disease_result"):
        conditions = state["disease_result"].get("conditions", [])
        ctx["has_diabetes_risk"] = any(
            c.get("name") == "Diabetes" and c.get("risk_level") in ("moderate", "high")
            for c in conditions
        )
        ctx["has_hypertension_risk"] = any(
            c.get("name") == "Hypertension" and c.get("risk_level") in ("moderate", "high")
            for c in conditions
        )

    if state.get("empathy_result"):
        ctx["mental_health_severity"] = state["empathy_result"].get("severity")

    if state.get("health_result"):
        scores = state["health_result"].get("dimension_scores", {})
        ctx["health_score"]  = state["health_result"].get("total_score")
        ctx["high_stress"]   = scores.get("stress", 15) < 8

    # Cross-agent pattern: diabetic risk + high stress = enhanced alert
    ctx["combined_diabetes_alert"] = bool(
        ctx.get("has_diabetes_risk") and ctx.get("high_stress")
    )
    return {"session_context": ctx}

# ── Doctor Finder Node ─────────────────────────────────────────────────────
async def doctor_finder_node(state: MedMASState) -> dict:
    if state.get("doctor_list"):
        return {"doctor_list": state["doctor_list"]}  # Keep existing

    specialty = "General"
    if state.get("symptom_result"):
        specialty = state["symptom_result"].get("recommended_specialty", "General")
    elif state.get("disease_result"):
        conditions = [c["name"] for c in state["disease_result"].get("conditions", [])]
        if "Diabetes" in conditions:
            specialty = "Endocrinology"
        elif "Hypertension" in conditions:
            specialty = "Cardiology"
    elif state.get("asha_result"):
        specialty = state["asha_result"].get("refer_specialty", "General")

    # Try OSM real nearby doctors if user lat/lng is available
    user_lat = state.get("user_lat")
    user_lng = state.get("user_lng")
    if user_lat and user_lng:
        try:
            osm_doctors = await find_nearby_doctors(
                lat=user_lat, lng=user_lng, specialty=specialty, limit=5,
            )
            print(f"[DoctorFinder] OSM returned {len(osm_doctors)} doctors for ({user_lat},{user_lng}) specialty={specialty}")
            if osm_doctors:
                return {"doctor_list": osm_doctors}
        except Exception as e:
            print(f"[DoctorFinder] OSM failed: {e}")
    else:
        print(f"[DoctorFinder] No coords in state, using CSV. district={state.get('user_district')}")

    # Fallback: static CSV doctors
    district = state.get("user_district") or ""
    # 1. Best: same district + same specialty
    doctors = find_doctors(specialty=specialty, district=district)
    # 2. Same district, any specialty (at least they are nearby)
    if not doctors and district:
        doctors = find_doctors(specialty="", district=district)
    # 3. Last resort: matching specialty from any district
    if not doctors:
        doctors = find_doctors(specialty=specialty, district="")
    return {"doctor_list": doctors}

# ── Response Aggregator ────────────────────────────────────────────────────
def response_aggregator_node(state: MedMASState) -> dict:
    parts  = []
    triage = state.get("triage_level", "routine")
    ctx    = state.get("session_context", {})

    # Crisis alert banner
    if state.get("crisis_detected"):
        parts.append("CRISIS SUPPORT RESOURCES")
        parts.append("=" * 40)
        parts.append("iCall: 9152987821 (Mon-Sat 8am-10pm, free)")
        parts.append("Vandrevala Foundation: 1860-2662-345 (24x7, free)")
        parts.append("Emergency: 112")
        parts.append("")

    # Cross-agent synthesis alert
    if ctx.get("combined_diabetes_alert"):
        parts.append("COMBINED RISK ALERT: High stress combined with diabetes risk markers increases your risk significantly. Please prioritise both conditions.")
        parts.append("")

    # Symptom result
    if state.get("symptom_result"):
        r = state["symptom_result"]
        parts.append("SYMPTOM ASSESSMENT")
        parts.append("=" * 40)
        for i, d in enumerate(r.get("diagnoses", []), 1):
            parts.append(f"{i}. {d['condition']} ({d['likelihood']} likelihood)")
            parts.append(f"   {d['reason']}")
        parts.append(f"\nTriage Level: {r.get('triage_level', 'routine').upper()}")
        if r.get("red_flags"):
            parts.append(f"Red Flags: {', '.join(r['red_flags'])}")
        parts.append(f"\nNext Steps: {r.get('next_steps', '')}")

    # Disease result
    if state.get("disease_result"):
        r = state["disease_result"]
        parts.append("\nLAB REPORT ANALYSIS")
        parts.append("=" * 40)
        for c in r.get("conditions", []):
            parts.append(f"{c['name']} Risk: {c['risk_score']}/100 ({c['risk_level']})")
            parts.append(f"  {c['plain_explanation']}")
        if r.get("urgency_flag"):
            parts.append("\nURGENT: Please see a doctor within 48 hours.")
        if r.get("lifestyle_recommendations"):
            parts.append("\nRecommendations:")
            for rec in r["lifestyle_recommendations"]:
                parts.append(f"  - {rec}")

    # Mental health result
    if state.get("empathy_result"):
        r = state["empathy_result"]
        parts.append(f"\n{r.get('response', '')}")

    # Health score result
    if state.get("health_result"):
        r = state["health_result"]
        parts.append("\nHEALTH SCORE")
        parts.append("=" * 40)
        parts.append(f"Overall Score: {r.get('total_score', 0)}/100")
        if r.get("action_items"):
            parts.append("Top 3 Actions:")
            for a in r["action_items"][:3]:
                parts.append(f"  {a['priority']}. {a['action']} (Impact: {a['impact']})")
        parts.append(f"\n{r.get('coach_message', '')}")

    # Off-topic result (skip doctor footer if off-topic)
    if state.get("offtopic_result"):
        return {"aggregated_response": state["offtopic_result"]["response"]}

    # ASHA result
    if state.get("asha_result"):
        r = state["asha_result"]
        parts.append("\nASHA FIELD TRIAGE")
        parts.append("=" * 40)
        parts.append(f"Decision: {r.get('triage_decision', '').upper()}")
        parts.append(f"Refer To: {r.get('refer_to', 'PHC')}")
        if r.get("urgency_hours"):
            parts.append(f"Urgency: Within {r.get('urgency_hours')} hours")
        parts.append(f"\n{r.get('clinical_summary', '')}")
        if r.get("danger_signs"):
            parts.append("\nDanger Signs to Watch:")
            for sign in r["danger_signs"]:
                parts.append(f"  - {sign}")

    # Doctor list
    if state.get("doctor_list"):
        parts.append("\nNEARBY DOCTORS")
        parts.append("=" * 40)
        for d in state["doctor_list"]:
            name = d.get('name', '')
            parts.append(f"{name} | {d.get('specialty','')} | {d.get('phone','')}")
            parts.append(f"  {d.get('address','')}")

    if not parts:
        parts.append("I was unable to process your request. Please try again.")

    response = "\n".join(parts) + DOCTOR_REFERRAL_FOOTER
    return {"aggregated_response": response}

# ── Graph Assembly ─────────────────────────────────────────────────────────
def build_graph() -> StateGraph:
    graph = StateGraph(MedMASState)

    graph.add_node("crisis_guard",        crisis_guard_node)
    graph.add_node("language_detector",   language_detector_node)
    graph.add_node("intent_classifier",   intent_classifier_node)
    graph.add_node("symptom_checker",     symptom_checker_node)
    graph.add_node("disease_predictor",   disease_predictor_node)
    graph.add_node("empathy_chatbot",     empathy_chatbot_node)
    graph.add_node("health_scorer",       health_scorer_node)
    graph.add_node("asha_copilot",        asha_copilot_node)
    graph.add_node("offtopic_responder",  offtopic_responder_node)
    graph.add_node("session_memory",      session_memory_node)
    graph.add_node("doctor_finder",       doctor_finder_node)
    graph.add_node("response_aggregator", response_aggregator_node)
    graph.add_node("multilingual_output", multilingual_output_node)

    # Entry point: crisis guard runs FIRST on every request
    graph.set_entry_point("crisis_guard")
    graph.add_edge("crisis_guard",      "language_detector")
    graph.add_edge("language_detector", "intent_classifier")

    # Conditional routing
    graph.add_conditional_edges(
        "intent_classifier",
        route_by_intent,
        {
            "symptom_checker":    "symptom_checker",
            "disease_predictor":  "disease_predictor",
            "empathy_chatbot":    "empathy_chatbot",
            "health_scorer":      "health_scorer",
            "asha_copilot":       "asha_copilot",
            "offtopic_responder": "offtopic_responder",
        }
    )

    # Every agent → session_memory → doctor_finder → aggregator → output
    for agent in ["symptom_checker", "disease_predictor", "empathy_chatbot",
                  "health_scorer", "asha_copilot", "offtopic_responder"]:
        graph.add_edge(agent, "session_memory")

    graph.add_edge("session_memory",      "doctor_finder")
    graph.add_edge("doctor_finder",       "response_aggregator")
    graph.add_edge("response_aggregator", "multilingual_output")
    graph.add_edge("multilingual_output", END)

    return graph.compile()


medmas_graph = build_graph()


async def run_pipeline(
    raw_input:      str,
    media_type:     str   = "text",
    pdf_bytes:      bytes = None,
    user_id:        str   = None,
    user_district:  str   = None,
    user_phone:     str   = None,
    user_lat:       float = None,
    user_lng:       float = None,
    asha_mode:      bool  = False,
    asha_worker_id: str   = None,
    patient_id:     str   = None,
) -> MedMASState:
    state = initial_state(
        raw_input=raw_input,
        media_type=media_type,
        pdf_bytes=pdf_bytes,
        user_id=user_id,
        user_district=user_district,
        user_phone=user_phone,
        user_lat=user_lat,
        user_lng=user_lng,
        asha_mode=asha_mode,
        asha_worker_id=asha_worker_id,
        patient_id=patient_id,
    )
    return await medmas_graph.ainvoke(state)
