# backend/agents/empathy_chatbot.py
"""
Agent 3: Empathy Chatbot
Solves: 230M mental health cases, 85% receiving zero care.
Uses VADER sentiment + keyword detection.
Escalates immediately with crisis resources if severity is high.
Never diagnoses. Max 3-sentence warm responses.
"""
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from config import llm
from state import MedMASState

ICALL_HELPLINE = "iCall: 9152987821 (free, confidential)"
VANDREVALA     = "Vandrevala Foundation: 1860-2662-345 (24x7)"

# These are in addition to crisis_guard.py keywords — chatbot has its own check
CRISIS_KEYWORDS = [
    "suicide", "kill myself", "end my life", "hopeless", "no point",
    "self harm", "cutting", "want to die", "can't go on", "not worth living",
    "marna chahta", "marna chahti", "jaan dena", "mar jaunga",
]

SYSTEM_PROMPT = f"""You are a compassionate mental health support companion for India.
Follow these rules strictly:
1. NEVER diagnose any mental health condition.
2. Use warm, non-clinical, conversational language.
3. Validate feelings BEFORE offering any suggestions.
4. Ask only ONE gentle question at a time.
5. Keep your response to a maximum of 3 sentences.
6. If severity is HIGH, you MUST include this at the end of your response:
   "Please reach out: {ICALL_HELPLINE} or {VANDREVALA}"
7. Never minimise feelings or give unsolicited advice.
8. If the user is an ASHA worker reporting a patient — shift to clinical support mode.
"""

_analyzer = SentimentIntensityAnalyzer()


def _detect_severity(text: str) -> str:
    """Classify mental health severity using VADER + crisis keywords."""
    scores      = _analyzer.polarity_scores(text)
    has_crisis  = any(kw in text.lower() for kw in CRISIS_KEYWORDS)
    if has_crisis or scores["compound"] < -0.6:
        return "high"
    elif scores["compound"] < -0.2:
        return "moderate"
    return "low"


def empathy_chatbot_node(state: MedMASState) -> dict:
    """LangGraph node: Mental health support with crisis detection."""
    user_text = state["translated_input"]
    severity  = _detect_severity(user_text)

    # Escalate if crisis was already detected by Crisis Guard
    if state.get("crisis_detected"):
        severity = "high"

    urgency_note = ""
    if severity == "high":
        urgency_note = (
            "\nCRITICAL: The user may be in crisis. "
            "Lead with deep empathy, then provide helpline numbers. "
            "Do not ask further questions until you have provided resources."
        )

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT + urgency_note),
        ("human", "The user says: {message}\nSeverity detected: {severity}")
    ])
    chain = prompt | llm | StrOutputParser()

    try:
        response = chain.invoke({"message": user_text, "severity": severity})
    except Exception as e:
        return {"error": f"EmpathyChatbot failed: {e}"}

    # Force-append crisis resources for high severity even if LLM forgot
    if severity == "high" and ICALL_HELPLINE not in response:
        response += f"\n\nPlease reach out now: {ICALL_HELPLINE} | {VANDREVALA}"

    return {
        "empathy_result": {
            "response":        response,
            "severity":        severity,
            "sentiment_score": _analyzer.polarity_scores(user_text)["compound"],
        },
        "triage_level": "urgent" if severity == "high" else "moderate",
    }
