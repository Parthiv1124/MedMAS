# backend/agents/symptom_checker.py
"""
Agent 1: Symptom Checker
Solves: Rural access gap — 920M people with no nearby doctor.
Uses RAG over Qdrant medical KB for context-aware triage.
Returns top-3 differential diagnoses with triage level.
"""
from langchain_qdrant import QdrantVectorStore
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from config import llm, QDRANT_URL, QDRANT_API_KEY, QDRANT_COLLECTION, create_embeddings
from services.doctor_finder import find_doctors
from state import MedMASState

SYSTEM_PROMPT = """You are a medical triage assistant for rural India.
Given the symptoms below, respond ONLY with a valid JSON object in this exact schema:
{{
  "diagnoses": [
    {{"condition": "...", "likelihood": "high|medium|low", "reason": "one sentence"}},
    {{"condition": "...", "likelihood": "...",             "reason": "..."}},
    {{"condition": "...", "likelihood": "...",             "reason": "..."}}
  ],
  "triage_level": "urgent|moderate|routine",
  "recommended_specialty": "General|Cardiology|Neurology|Endocrinology|Psychiatry|Paediatrics|Obstetrics",
  "red_flags": ["symptom requiring immediate attention"],
  "next_steps": "plain language advice in 2 sentences for a rural patient"
}}
Rules:
- List exactly 3 diagnoses.
- Use ICMR India disease prevalence data — Indian diseases are more common than rare Western ones.
- Never give a single definitive diagnosis.
- triage_level urgent = needs care within 6 hours.
"""

# Lazy-loaded Qdrant store (initialized on first use)
_embeddings    = create_embeddings()
_qdrant_store  = None
_retriever     = None


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


def symptom_checker_node(state: MedMASState) -> dict:
    """LangGraph node: Symptom triage via RAG + LLM."""
    symptoms = state["translated_input"]

    # 1. Retrieve relevant medical context from Qdrant
    try:
        retriever = _get_retriever()
        docs    = retriever.get_relevant_documents(symptoms)
        context = "\n".join(d.page_content for d in docs)
    except Exception as e:
        print(f"[SymptomChecker] Qdrant retrieval failed: {e}")
        context = ""

    # 2. Invoke LLM with context
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", "Symptoms: {symptoms}\n\nMedical Context:\n{context}")
    ])
    chain = prompt | llm | JsonOutputParser()

    try:
        result = chain.invoke({"symptoms": symptoms, "context": context})
    except Exception as e:
        return {"error": f"SymptomChecker failed: {e}", "triage_level": "routine"}

    # 3. Find nearby doctors for recommended specialty
    doctors = find_doctors(
        specialty=result.get("recommended_specialty", "General"),
        district=state.get("user_district") or ""
    )

    return {
        "symptom_result": result,
        "triage_level":   result.get("triage_level", "routine"),
        "doctor_list":    doctors,
    }
