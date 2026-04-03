# backend/config.py
import os
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

# Project root = parent of backend/
PROJECT_ROOT = Path(__file__).resolve().parent.parent

load_dotenv(PROJECT_ROOT / ".env")

def _clean_env(name: str):
    value = os.getenv(name)
    if value is None:
        return None
    return value.strip().strip('"').strip("'")


DEEPINFRA_API_KEY  = _clean_env("DEEPINFRA_API_KEY")
DEEPINFRA_BASE_URL = os.getenv("DEEPINFRA_BASE_URL", "https://api.deepinfra.com/v1/openai")
SUPABASE_URL       = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY  = os.getenv("SUPABASE_ANON_KEY")
MODEL_NAME         = os.getenv("MODEL_NAME", "meta-llama/Meta-Llama-3.1-8B-Instruct")
EMBEDDING_MODEL    = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
SPEECH_TO_TEXT_MODEL = os.getenv("SPEECH_TO_TEXT_MODEL", "openai/whisper-large-v3")

# Resolve all paths relative to project root
DOCTORS_CSV_PATH   = str(PROJECT_ROOT / os.getenv("DOCTORS_CSV_PATH", "data/doctors.csv"))
LAB_RANGES_PATH    = str(PROJECT_ROOT / os.getenv("LAB_RANGES_PATH", "data/lab_ranges.json"))
QDRANT_URL         = os.getenv("QDRANT_URL")
QDRANT_API_KEY     = os.getenv("QDRANT_API_KEY")
QDRANT_COLLECTION  = os.getenv("QDRANT_COLLECTION", "medmas_medical_kb")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")

UNSUPPORTED_MODEL_ALIASES = {
    "gpt-4.1-mini": "meta-llama/Meta-Llama-3.1-8B-Instruct",
    "gpt-4o-mini": "meta-llama/Meta-Llama-3.1-8B-Instruct",
    "text-embedding-3-small": "BAAI/bge-small-en-v1.5",
}


def _resolve_model_name(name: str) -> str:
    if not name:
        return "meta-llama/Meta-Llama-3.1-8B-Instruct"
    return UNSUPPORTED_MODEL_ALIASES.get(name, name)


def _resolve_embedding_model(name: str) -> str:
    if not name:
        return "BAAI/bge-small-en-v1.5"
    return UNSUPPORTED_MODEL_ALIASES.get(name, name)

def create_llm(temperature: float = 0.2) -> ChatOpenAI:
    return ChatOpenAI(
        model=_resolve_model_name(MODEL_NAME),
        temperature=temperature,
        api_key=DEEPINFRA_API_KEY,
        base_url=DEEPINFRA_BASE_URL,
    )


def create_embeddings() -> OpenAIEmbeddings:
    return OpenAIEmbeddings(
        model=_resolve_embedding_model(EMBEDDING_MODEL),
        api_key=DEEPINFRA_API_KEY,
        base_url=DEEPINFRA_BASE_URL,
    )


def create_openai_client() -> OpenAI:
    return OpenAI(
        api_key=DEEPINFRA_API_KEY,
        base_url=DEEPINFRA_BASE_URL,
    )


# Singleton LLM shared across all agents via DeepInfra's OpenAI-compatible API.
llm = create_llm()
openai_client = create_openai_client()

# Singleton Supabase client — graceful fallback if credentials are placeholders
supabase = None
try:
    if SUPABASE_URL and "xxxx" not in SUPABASE_URL:
        from supabase import create_client, Client
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    else:
        print("[Config] Supabase credentials not configured — logging disabled")
except Exception as e:
    print(f"[Config] Supabase init failed: {e} — logging disabled")
