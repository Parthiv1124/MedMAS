# backend/agents/disease_predictor.py
"""
Agent 2: Disease Predictor
Solves: 200M undetected diabetics and hypertension cases.
Accepts PDF lab report or manually entered values.
Validates against ICMR thresholds, generates plain-language risk report.
"""
import json
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser, StrOutputParser
from config import llm, LAB_RANGES_PATH
from services.pdf_parser import process_lab_report, parse_lab_values, flag_abnormal_values
from state import MedMASState

with open(LAB_RANGES_PATH) as f:
    LAB_RANGES = json.load(f)

SYSTEM_PROMPT = """You are a clinical risk analyst for Indian healthcare.
You receive lab values (with ICMR threshold flags where available).
Analyse ALL provided values and assess risk for ANY relevant conditions
(e.g. Diabetes, Hypertension, Hypercholesterolaemia, Anaemia, Thyroid disorders,
Liver disease, Kidney disease, Infection markers, etc.).
Only include conditions that the provided values can actually indicate.

You MUST respond with ONLY a valid JSON object — no extra text, no explanation outside JSON:
{{
  "conditions": [
    {{
      "name": "<condition name>",
      "risk_score": <0-100>,
      "risk_level": "low|moderate|high",
      "key_indicator": "the most abnormal metric driving this risk",
      "plain_explanation": "2 sentences a patient with no medical background can understand"
    }}
  ],
  "urgency_flag": true|false,
  "lifestyle_recommendations": ["specific action 1", "specific action 2", "specific action 3"],
  "follow_up_tests": ["test name if needed"]
}}
urgency_flag=true means the patient must see a doctor within 48 hours.
Use ICMR clinical guidelines for the Indian population.
If some key values are missing, assess based on what is available and recommend follow-up tests for the gaps.
"""

LLM_EXTRACT_PROMPT = """Extract lab values from the following medical report text.
Return ONLY a valid JSON object with the lab values you find. Use these exact keys
where applicable: HbA1c, fasting_glucose, systolic_bp, diastolic_bp, total_cholesterol,
HDL, LDL, BMI, creatinine, hemoglobin, RBC, WBC, platelets, triglycerides,
urea, uric_acid, TSH, T3, T4, sodium, potassium, calcium, iron, vitamin_D,
vitamin_B12, albumin, bilirubin, SGOT, SGPT, alkaline_phosphatase.

All values must be numeric. Only include values you can clearly identify.
If you cannot find ANY lab values, return exactly: {{}}.

Report text:
{text}"""

LAB_EXTRACTION_FIELDS = [
    "HbA1c", "fasting_glucose", "systolic_bp", "diastolic_bp", "total_cholesterol",
    "LDL", "HDL", "BMI", "creatinine", "hemoglobin", "RBC", "WBC", "platelets", "triglycerides",
    "urea", "uric_acid", "TSH", "T3", "T4", "sodium", "potassium", "calcium", "iron", "vitamin_D",
    "vitamin_B12", "albumin", "bilirubin", "SGOT", "SGPT", "alkaline_phosphatase",
]

LAB_EXTRACTION_PROMPT = f"""You are a lab data extractor.
Return only a JSON object that includes any of these fields: {', '.join(LAB_EXTRACTION_FIELDS)}.
Use the exact field names, include only numeric values, and omit any additional text.
If none of these values are present, respond with exactly {{}}.

Lab report text:
{{text}}"""


def _llm_extract_lab_values(raw_text: str) -> dict:
    """Use the LLM to extract lab values when regex patterns fail."""
    if not raw_text or len(raw_text.strip()) < 20:
        return {}
    truncated = raw_text[:4000]
    prompt = ChatPromptTemplate.from_template(LAB_EXTRACTION_PROMPT)
    chain = prompt | llm | StrOutputParser()
    try:
        raw_output = chain.invoke({"text": truncated})
        cleaned = raw_output.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        values = json.loads(cleaned)
        return {k: float(v) for k, v in values.items() if isinstance(v, (int, float))}
    except Exception:
        return {}


def disease_predictor_node(state: MedMASState) -> dict:
    """LangGraph node: Lab report analysis and chronic disease risk scoring."""
    raw_text = ""

    # Parse input — PDF or manual text
    if state.get("pdf_bytes"):
        lab_data = process_lab_report(state["pdf_bytes"])
        flags    = lab_data["flags"]
        values   = lab_data["values"]
        raw_text = lab_data.get("raw_text", "")
    else:
        values = parse_lab_values(state["translated_input"])
        flags  = flag_abnormal_values(values)
        raw_text = state.get("translated_input", "")

    # Fallback: use LLM to extract values if regex found nothing
    if not values and raw_text:
        print("[DiseasePredictor] Regex found no values, trying LLM extraction...")
        values = _llm_extract_lab_values(raw_text)
        flags  = flag_abnormal_values(values)
        if values:
            print(f"[DiseasePredictor] LLM extracted {len(values)} values: {list(values.keys())}")

    if not values:
        print("[DiseasePredictor] Lab extraction still empty after LLM. Raw text snippet:")
        snippet = raw_text.replace("\\n", " ").strip()[:400]
        print(snippet or "[empty]")
        return {"error": "Could not extract any lab values from the input."}

    # Build input that includes both raw values and flags
    lab_input = {
        "raw_values": values,
        "icmr_flags": flags if flags else "No ICMR flags available — assess from raw values",
    }
    lab_input_str = json.dumps(lab_input, indent=2)

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", "Lab values with ICMR flags:\n{lab_input}")
    ])

    # Try JsonOutputParser first, fall back to manual parsing
    try:
        chain = prompt | llm | JsonOutputParser()
        result = chain.invoke({"lab_input": lab_input_str})
    except Exception:
        # Fallback: get raw text and parse manually
        try:
            chain_raw = prompt | llm | StrOutputParser()
            raw_output = chain_raw.invoke({"lab_input": lab_input_str})
            cleaned = raw_output.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            # Find first { and last } to extract JSON
            start = cleaned.find("{")
            end = cleaned.rfind("}") + 1
            if start >= 0 and end > start:
                result = json.loads(cleaned[start:end])
            else:
                return {"error": "DiseasePredictor could not generate a valid risk assessment."}
        except Exception as e:
            return {"error": f"DiseasePredictor failed: {e}"}

    result["raw_values"]  = values
    result["icmr_flags"]  = flags
    triage = "urgent" if result.get("urgency_flag") else "moderate"

    return {"disease_result": result, "triage_level": triage}
