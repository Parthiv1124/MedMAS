# backend/config.py
import os
from pathlib import Path
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

# Project root = parent of backend/
PROJECT_ROOT = Path(__file__).resolve().parent.parent

load_dotenv(PROJECT_ROOT / ".env")

OPENAI_API_KEY     = os.getenv("OPENAI_API_KEY")
SUPABASE_URL       = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY  = os.getenv("SUPABASE_ANON_KEY")
MODEL_NAME         = os.getenv("MODEL_NAME", "gpt-4o-mini")
EMBEDDING_MODEL    = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")

# Resolve all paths relative to project root
DOCTORS_CSV_PATH   = str(PROJECT_ROOT / os.getenv("DOCTORS_CSV_PATH", "data/doctors.csv"))
LAB_RANGES_PATH    = str(PROJECT_ROOT / os.getenv("LAB_RANGES_PATH", "data/lab_ranges.json"))
QDRANT_URL         = os.getenv("QDRANT_URL")
QDRANT_API_KEY     = os.getenv("QDRANT_API_KEY")
QDRANT_COLLECTION  = os.getenv("QDRANT_COLLECTION", "medmas_medical_kb")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")

# Singleton LLM — shared across all agents (GPT-4o mini: $0.15/1M tokens)
llm = ChatOpenAI(
    model=MODEL_NAME,
    temperature=0.2,
    api_key=OPENAI_API_KEY
)

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
