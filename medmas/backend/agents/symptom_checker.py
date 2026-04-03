# backend/agents/symptom_checker.py
"""
Agent 1: Symptom Checker
Solves: Rural access gap — 920M people with no nearby doctor.
Uses RAG over FAISS medical KB for context-aware triage.
Returns top-3 differential diagnoses with triage level.
"""
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from config import llm, FAISS_INDEX_PATH, EMBEDDING_MODEL, OPENAI_API_KEY
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

# Load FAISS once at module import (cached in memory)
_embeddings   = OpenAIEmbeddings(model=EMBEDDING_MODEL, api_key=OPENAI_API_KEY)
_faiss_store  = FAISS.load_local(FAISS_INDEX_PATH, _embeddings, allow_dangerous_deserialization=True)
_retriever    = _faiss_store.as_retriever(search_kwargs={"k": 5})


def symptom_checker_node(state: MedMASState) -> dict:
    """LangGraph node: Symptom triage via RAG + LLM."""
    symptoms = state["translated_input"]

    # 1. Retrieve relevant medical context from FAISS
    docs    = _retriever.get_relevant_documents(symptoms)
    context = "\n".join(d.page_content for d in docs)

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
