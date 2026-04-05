# backend/agents/multilingual.py
from services.translator import detect_language, translate_to_english, translate_response, TRANSLATION_FAILED, DEFAULT_FALLBACK_RESPONSE
from state import MedMASState

def language_detector_node(state: MedMASState) -> dict:
    """Node: Detect language + translate input to English for all agents."""
    raw = state["raw_input"]
    lang = detect_language(raw)
    english = translate_to_english(raw, source_lang=lang)
    
    # Check if translation failed
    translation_failed = english == TRANSLATION_FAILED
    
    return {
        "input_lang": lang,
        "translated_input": english if not translation_failed else raw,  # Keep original if failed
        "translation_failed": translation_failed,
    }

def multilingual_output_node(state: MedMASState) -> dict:
    """Node: Translate final aggregated response back to user's language."""
    response = state["aggregated_response"]
    lang = state.get("input_lang", "en")
    translation_failed = state.get("translation_failed", False)
    
    # If translation failed earlier, return default fallback response
    if translation_failed:
        return {"final_response": DEFAULT_FALLBACK_RESPONSE}
    
    translated = translate_response(response, target_lang=lang)
    return {"final_response": translated}
