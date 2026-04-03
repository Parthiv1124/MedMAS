# backend/services/translator.py
from langdetect import detect
from deep_translator import GoogleTranslator
from gtts import gTTS
import io

SUPPORTED_LANGS = {
    "hi": "Hindi", "bn": "Bengali", "te": "Telugu",
    "mr": "Marathi", "ta": "Tamil",  "gu": "Gujarati",
    "kn": "Kannada", "ml": "Malayalam", "pa": "Punjabi",
    "or": "Odia",   "ur": "Urdu",    "as": "Assamese",
    "en": "English"
}

def detect_language(text: str) -> str:
    """Detect language code. Returns 'en' on failure."""
    try:
        return detect(text)
    except Exception:
        return "en"

def translate_to_english(text: str, source_lang: str = "auto") -> str:
    """Translate any Indian language text to English."""
    if source_lang == "en":
        return text
    try:
        return GoogleTranslator(source=source_lang, target="en").translate(text)
    except Exception as e:
        print(f"[Translator] to-English error: {e}")
        return text  # Fail safe: return original

def translate_response(text: str, target_lang: str) -> str:
    """Translate English LLM response back to user's language."""
    if target_lang == "en":
        return text
    try:
        return GoogleTranslator(source="en", target=target_lang).translate(text)
    except Exception as e:
        print(f"[Translator] from-English error: {e}")
        return text

def text_to_speech(text: str, lang: str = "en") -> bytes:
    """Convert text to audio bytes using gTTS."""
    tts = gTTS(text=text, lang=lang, slow=False)
    buf = io.BytesIO()
    tts.write_to_fp(buf)
    return buf.getvalue()
