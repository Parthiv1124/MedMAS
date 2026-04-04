# backend/agents/health_scorer.py
"""
Agent 4: Health Scorer
Solves: Only 14% of health spend is preventive. 500M NCD screening gap.
Rule-based scoring (WHO guidelines) + LLM for personalised coaching.
5 dimensions: sleep, activity, nutrition, stress, habits.
"""
import json
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from config import llm
from state import MedMASState

SCORING_RULES = {
    "sleep":    {"ideal_hours": (7, 9),    "max_score": 20},
    "activity": {"ideal_days":  5,          "max_score": 25},
    "nutrition":{"ideal_meals": 3,          "max_score": 25},
    "stress":   {"ideal_max":   4,          "max_score": 15},
    "habits":   {                           "max_score": 15},
}

def _calculate_base_score(data: dict) -> dict:
    """Rule-based scoring against WHO recommended ranges."""
    scores = {}

    # Sleep (0-20): WHO recommends 7-9 hours for adults
    sleep = float(data.get("sleep_hours", 7))
    lo, hi = SCORING_RULES["sleep"]["ideal_hours"]
    if lo <= sleep <= hi:
        scores["sleep"] = 20
    else:
        deficit = min(abs(sleep - lo), abs(sleep - hi))
        scores["sleep"] = max(0, int(20 - deficit * 4))

    # Activity (0-25): WHO = 150 min moderate/week ~ 5 days
    exercise = int(data.get("exercise_days_per_week", 0))
    scores["activity"] = min(25, exercise * 5)

    # Nutrition (0-25): 1 balanced meal = 8 points, capped at 25
    meals = int(data.get("balanced_meals_per_day", 2))
    scores["nutrition"] = min(25, meals * 8)

    # Stress (0-15): Self-reported 1-10 scale
    stress = float(data.get("stress_level", 5))
    scores["stress"] = max(0, int(15 - (stress - 1) * 1.5))

    # Habits (0-15): Smoking and alcohol penalties
    habit_score = 15
    if data.get("smoker", False):
        habit_score -= 8
    if int(data.get("alcohol_units_per_week", 0)) > 14:
        habit_score -= 5
    scores["habits"] = max(0, habit_score)

    return scores


SYSTEM_PROMPT = """You are a preventive health coach for India.
Given lifestyle data and pre-calculated dimension scores, respond ONLY with JSON:
{{
  "total_score": 0-100,
  "dimension_scores": {{"sleep": N, "activity": N, "nutrition": N, "stress": N, "habits": N}},
  "action_items": [
    {{"priority": 1, "action": "specific step", "impact": "what it will improve"}},
    {{"priority": 2, "action": "...", "impact": "..."}},
    {{"priority": 3, "action": "...", "impact": "..."}}
  ],
  "next_checkup_days": 90,
  "coach_message": "2-sentence encouraging summary"
}}
Use WHO physical activity guidelines and ICMR dietary recommendations for Indians.
"""

def health_scorer_node(state: MedMASState) -> dict:
    """LangGraph node: Lifestyle scoring and personalised coaching."""
    # Parse lifestyle data — accepts JSON or "key: value, ..." format
    try:
        lifestyle_data = json.loads(state["translated_input"])
    except (json.JSONDecodeError, TypeError):
        lifestyle_data = {}
        for pair in state["translated_input"].split(","):
            if ":" in pair:
                k, v = pair.split(":", 1)
                lifestyle_data[k.strip().lower().replace(" ", "_")] = v.strip()

    base_scores = _calculate_base_score(lifestyle_data)
    total       = sum(base_scores.values())

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", "Lifestyle data: {data}\n\nPre-calculated scores: {scores}\nTotal: {total}/100")
    ])
    chain = prompt | llm | JsonOutputParser()

    try:
        result = chain.invoke({
            "data":   json.dumps(lifestyle_data),
            "scores": json.dumps(base_scores),
            "total":  total,
        })
    except Exception as e:
        return {"error": f"HealthScorer failed: {e}"}

    return {"health_result": result}
