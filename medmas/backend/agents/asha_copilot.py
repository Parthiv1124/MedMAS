# backend/agents/asha_copilot.py
"""
Agent 6: ASHA Worker Copilot
Solves: 490M informal healthcare workers with no decision support.
ASHA workers are government-trained community health activists serving
villages of 1,000-1,500 people. They are NOT doctors — they need
simple, actionable guidance in plain language.

Input:  Patient observations from field (voice or text, any language)
Output: Triage decision, referral guidance, auto-filled documentation
"""
import json
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from config import llm
from services.doctor_finder import find_doctors
from state import MedMASState

SYSTEM_PROMPT = """You are a decision support assistant for ASHA (Accredited Social Health Activist) workers in rural India.

ASHA workers have 12th-grade education and 23 days of health training — they are NOT doctors.
Give them CLEAR, SIMPLE, ACTIONABLE guidance. Avoid medical jargon.

Given patient field observations, respond ONLY with valid JSON:
{{
  "triage_decision": "refer_urgent | refer_routine | monitor_at_home",
  "refer_to": "PHC | CHC | District Hospital | Specialist",
  "refer_specialty": "General|Paediatrics|Obstetrics|Cardiology|Endocrinology",
  "urgency_hours": 2 | 6 | 24 | 72 | null,
  "clinical_summary": "2 sentences the ASHA worker can read aloud to the patient",
  "danger_signs": ["specific warning sign 1", "specific warning sign 2"],
  "home_care_steps": [
    "Simple step 1 the patient can do at home",
    "Simple step 2",
    "Simple step 3"
  ],
  "documentation": {{
    "chief_complaint":    "brief description",
    "duration":           "how long symptoms present",
    "key_vitals_noted":   "any vitals the ASHA recorded",
    "action_taken":       "what was decided",
    "follow_up_date":     "DD/MM/YYYY or null"
  }},
  "asha_script": "Exact words the ASHA worker can say to the patient in simple language"
}}

Special rules:
- Child under 5 with fever -> lower threshold for urgent referral (IMCI guidelines)
- Pregnant woman with any danger sign -> refer_urgent immediately
- BP mentioned as >=140/90 -> refer_routine minimum
- Chest pain or difficulty breathing -> refer_urgent always
- If prior agent findings are provided, incorporate them into your decision
"""

def asha_copilot_node(state: MedMASState) -> dict:
    """LangGraph node: Field triage and auto-documentation for ASHA workers."""
    observations = state["translated_input"]

    # Pull any prior agent findings from cross-agent session memory
    prior_context = ""
    if state.get("symptom_result"):
        prior_context += f"\nSymptom assessment: {json.dumps(state['symptom_result'])}"
    if state.get("disease_result"):
        prior_context += f"\nLab results: {json.dumps(state['disease_result'])}"
    if state.get("session_context"):
        ctx = state["session_context"]
        if ctx.get("combined_diabetes_alert"):
            prior_context += "\nCombined diabetes + stress alert already detected."

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", "Patient field observations: {observations}\n\nPrior assessments from MedMAS:{context}")
    ])
    chain = prompt | llm | JsonOutputParser()

    try:
        result = chain.invoke({
            "observations": observations,
            "context": prior_context or " None",
        })
    except Exception as e:
        return {"error": f"ASHACopilot failed: {e}"}

    # Find nearest facility/doctor based on triage decision
    doctors = find_doctors(
        specialty=result.get("refer_specialty", "General"),
        district=state.get("user_district") or ""
    )

    triage = "urgent" if result.get("triage_decision") == "refer_urgent" else "moderate"

    return {
        "asha_result":  result,
        "doctor_list":  doctors,
        "triage_level": triage,
    }
