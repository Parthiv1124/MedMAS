# backend/agents/multilingual.py
from services.translator import detect_language, translate_to_english, translate_response
from state import MedMASState

def language_detector_node(state: MedMASState) -> dict:
    """Node: Detect language + translate input to English for all agents."""
    raw = state["raw_input"]
    lang = detect_language(raw)
    english = translate_to_english(raw, source_lang=lang)
    return {
        "input_lang": lang,
        "translated_input": english,
    }

def multilingual_output_node(state: MedMASState) -> dict:
    """Node: Translate final aggregated response back to user's language."""
    response = state["aggregated_response"]
    lang = state.get("input_lang", "en")
    translated = translate_response(response, target_lang=lang)
    return {"final_response": translated}
