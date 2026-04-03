# backend/agents/disease_predictor.py
"""
Agent 2: Disease Predictor
Solves: 200M undetected diabetics and hypertension cases.
Accepts PDF lab report or manually entered values.
Validates against ICMR thresholds, generates plain-language risk report.
"""
import json
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from config import llm, LAB_RANGES_PATH
from services.pdf_parser import process_lab_report, parse_lab_values, flag_abnormal_values
from state import MedMASState

with open(LAB_RANGES_PATH) as f:
    LAB_RANGES = json.load(f)

SYSTEM_PROMPT = """You are a clinical risk analyst for Indian healthcare.
You receive structured lab values with their ICMR threshold flags.
Respond ONLY with a valid JSON object:
{{
  "conditions": [
    {{
      "name": "Diabetes|Hypertension|Hypercholesterolaemia",
      "risk_score": 0-100,
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
Use ICMR clinical guidelines for the Indian population specifically.
"""

def disease_predictor_node(state: MedMASState) -> dict:
    """LangGraph node: Lab report analysis and chronic disease risk scoring."""
    # Parse input — PDF or manual text
    if state.get("pdf_bytes"):
        lab_data = process_lab_report(state["pdf_bytes"])
        flags    = lab_data["flags"]
        values   = lab_data["values"]
    else:
        values = parse_lab_values(state["translated_input"])
        flags  = flag_abnormal_values(values)

    if not values:
        return {"error": "Could not extract any lab values from the input."}

    flags_str = json.dumps(flags, indent=2)
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", "Lab values with ICMR flags:\n{flags}")
    ])
    chain = prompt | llm | JsonOutputParser()

    try:
        result = chain.invoke({"flags": flags_str})
    except Exception as e:
        return {"error": f"DiseasePredictor failed: {e}"}

    result["raw_values"]  = values
    result["icmr_flags"]  = flags
    triage = "urgent" if result.get("urgency_flag") else "moderate"

    return {"disease_result": result, "triage_level": triage}
