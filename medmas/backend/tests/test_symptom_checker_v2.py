import unittest
from unittest.mock import patch

from agents import symptom_checker_v2 as symptom_checker


class SymptomCheckerV2Tests(unittest.TestCase):
    def test_detect_red_flags_marks_chest_pain_as_urgent(self):
        structured = {
            "primary_symptoms": ["chest pain"],
            "associated_symptoms": ["sweating"],
            "risk_factors": [],
            "severity": "moderate",
        }

        result = symptom_checker._detect_red_flags(
            "I have chest pain and sweating", structured
        )

        self.assertTrue(result["detected"])
        self.assertEqual(result["triage_floor"], "urgent")
        self.assertEqual(result["suggested_specialty"], "Cardiology")
        self.assertIn("chest pain or pressure", result["items"])

    def test_synthesize_triage_upgrades_severe_case_to_moderate(self):
        structured = {
            "severity": "severe",
            "duration": "2 days",
        }
        red_flags = {
            "triage_floor": "routine",
            "suggested_specialty": None,
            "reason": "",
        }
        differentials = {
            "diagnoses": [
                {"condition": "Migraine", "likelihood": "medium", "reason": "Headache pattern"},
                {"condition": "Tension headache", "likelihood": "low", "reason": "Stress related"},
                {"condition": "Sinusitis", "likelihood": "low", "reason": "Pressure symptoms"},
            ],
            "recommended_specialty": "General",
        }

        result = symptom_checker._synthesize_triage(structured, red_flags, differentials)

        self.assertEqual(result["triage_level"], "moderate")
        self.assertEqual(result["recommended_specialty"], "General")
        self.assertGreaterEqual(result["diagnosis_confidence"], 0.6)

    @patch("agents.symptom_checker_v2.find_doctors")
    @patch("agents.symptom_checker_v2._reason_differentials")
    @patch("agents.symptom_checker_v2._retrieve_context")
    @patch("agents.symptom_checker_v2._structure_symptoms")
    def test_symptom_checker_node_returns_compatible_contract(
        self,
        mock_structure,
        mock_retrieve,
        mock_reason,
        mock_find_doctors,
    ):
        mock_structure.return_value = {
            "primary_symptoms": ["fever", "cough"],
            "associated_symptoms": ["fatigue"],
            "duration": "3 days",
            "severity": "moderate",
            "body_site": "throat",
            "risk_factors": ["diabetes"],
            "missing_critical_info": ["age"],
            "retrieval_domain": "respiratory",
        }
        mock_retrieve.return_value = "respiratory context"
        mock_reason.return_value = {
            "diagnoses": [
                {"condition": "Viral fever", "likelihood": "high", "reason": "Fever and cough"},
                {"condition": "Bronchitis", "likelihood": "medium", "reason": "Persistent cough"},
                {"condition": "Flu-like illness", "likelihood": "medium", "reason": "Systemic symptoms"},
            ],
            "recommended_specialty": "General",
            "follow_up_questions": ["Do you have breathlessness?"],
            "confidence_summary": "medium",
        }
        mock_find_doctors.return_value = [{"name": "Dr A", "specialty": "General"}]

        state = {
            "translated_input": "fever and cough for 3 days",
            "user_district": "Vadodara",
        }

        result = symptom_checker.symptom_checker_node(state)

        self.assertIn("symptom_result", result)
        self.assertIn("triage_level", result)
        self.assertIn("doctor_list", result)

        symptom_result = result["symptom_result"]
        self.assertIn("structured_symptoms", symptom_result)
        self.assertIn("diagnoses", symptom_result)
        self.assertIn("recommended_specialty", symptom_result)
        self.assertIn("follow_up_questions", symptom_result)
        self.assertEqual(symptom_result["recommended_specialty"], "General")
        self.assertEqual(result["doctor_list"][0]["name"], "Dr A")


if __name__ == "__main__":
    unittest.main()
