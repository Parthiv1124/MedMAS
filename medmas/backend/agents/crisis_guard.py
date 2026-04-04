# backend/agents/crisis_guard.py
"""
Global Crisis Guard — runs on EVERY input before routing.
Detects crisis signals in raw_input (pre-translation) so rural users
writing in any Indian language are protected, not just English speakers.
"""
from state import MedMASState

# Multilingual crisis keywords (English + common Indic transliterations)
CRISIS_KEYWORDS = [
    # English
    "suicide", "kill myself", "end my life", "want to die",
    "no point living", "self harm", "cutting myself", "hopeless",
    "can't go on", "not worth living", "end it all",
    # Hindi transliteration
    "marna chahta", "marna chahti", "jaan dena", "khatam karna",
    "jeena nahi", "mar jaunga", "mar jaungi", "khud ko khatam",
    # Gujarati transliteration
    "mari jaish", "jivan khatam", "marne nu man",
    # Tamil transliteration
    "saaganum", "saaka vendam",
    # Marathi transliteration
    "maraycha ahe", "jivanat nako",
]

ICALL      = "iCall: 9152987821 (free, confidential, Mon–Sat 8am–10pm)"
VANDREVALA = "Vandrevala Foundation: 1860-2662-345 (24x7 free)"
SNEHI      = "SNEHI: 044-24640050 (24x7)"
EMERGENCY  = "Emergency: 112"


def crisis_guard_node(state: MedMASState) -> dict:
    """
    LangGraph node: Scans raw_input for crisis signals.
    Never blocks the pipeline — sets flags so downstream agents adapt.
    Even if crisis detected, we still route through empathy chatbot
    so the user gets a warm, human response (not just a phone number).
    """
    raw = state["raw_input"].lower()
    found = [kw for kw in CRISIS_KEYWORDS if kw in raw]

    if not found:
        return {
            "crisis_detected": False,
            "crisis_keywords_found": [],
        }

    # Pre-build a crisis response. This will be translated by Agent 5 later.
    crisis_message = (
        "I can hear that you are going through something very painful right now. "
        "You are not alone, and there are people who want to help you.\n\n"
        "Please reach out right now:\n"
        f"  {ICALL}\n"
        f"  {VANDREVALA}\n"
        f"  {SNEHI}\n\n"
        f"If you are in immediate danger, call {EMERGENCY}.\n\n"
        "I am here with you. Can you tell me a little more about how you are feeling?"
    )

    return {
        "crisis_detected": True,
        "crisis_keywords_found": found,
        "triage_level": "urgent",
        # Pre-populate aggregated_response so even if LLM fails, user gets help
        "aggregated_response": crisis_message,
        # Still route to empathy_chatbot for a full warm response
        "intent": "mental",
        "agents_to_run": ["empathy_chatbot"],
    }
