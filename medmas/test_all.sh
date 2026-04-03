#!/bin/bash
# MedMAS — Full Integration Test Suite (All 12 endpoints)
# Usage: cd medmas && bash test_all.sh
# Prerequisites: server running on port 8000

BASE="${1:-http://localhost:8000}"
PASS=0
FAIL=0

run_test() {
    local name="$1"
    local expected="$2"
    local response="$3"

    if echo "$response" | grep -q "$expected"; then
        echo "  PASS: $name"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $name (expected '$expected')"
        echo "        Got: $(echo "$response" | head -c 300)"
        FAIL=$((FAIL + 1))
    fi
}

echo "============================================"
echo "  MedMAS Full Integration Test Suite"
echo "  Target: $BASE"
echo "============================================"
echo ""

# ── Group 1: No API key needed ──────────────────────────────
echo "[1/12] GET /health"
R=$(curl -s "$BASE/health")
run_test "status ok" '"status":"ok"' "$R"
run_test "6 agents" '"agents":6' "$R"

echo ""
echo "[2/12] GET /api/crisis-resources"
R=$(curl -s "$BASE/api/crisis-resources")
run_test "iCall present" '9152987821' "$R"
run_test "Vandrevala present" '1860-2662-345' "$R"

echo ""
echo "[3/12] GET /api/doctors"
R=$(curl -s "$BASE/api/doctors?specialty=Cardiology&district=Vadodara")
run_test "Vadodara cardiologist" 'Sunita Patel' "$R"

R=$(curl -s "$BASE/api/doctors?specialty=Endocrinology&district=Surat")
run_test "Surat endocrinologist" 'Viral Shah' "$R"

echo ""
echo "[4/12] POST /api/reminder"
R=$(curl -s -X POST "$BASE/api/reminder" \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210", "message": "Take BP medication", "days_from_now": 1}')
run_test "reminder scheduled" '"scheduled":true' "$R"

# ── Group 2: Needs OpenAI API key ───────────────────────────
echo ""
echo "[5/12] POST /api/chat — Crisis detection"
R=$(curl -s -X POST "$BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "I feel completely hopeless and want to end my life"}')
run_test "crisis_detected" '"crisis_detected":true' "$R"
run_test "triage urgent" '"triage_level":"urgent"' "$R"
run_test "iCall in response" '9152987821' "$R"

echo ""
echo "[6/12] POST /api/chat — English symptoms (Agent 1)"
R=$(curl -s -X POST "$BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "I have had fever for 3 days and difficulty breathing", "user_district": "Vadodara"}')
run_test "response present" '"response"' "$R"
run_test "intent is symptom" '"intent":"symptom"' "$R"

echo ""
echo "[7/12] POST /api/chat — Lab values (Agent 2)"
R=$(curl -s -X POST "$BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "My HbA1c is 8.2 and Blood Pressure is 150/95", "user_district": "Surat"}')
run_test "response present" '"response"' "$R"
run_test "intent is lab" '"intent":"lab"' "$R"

echo ""
echo "[8/12] POST /api/chat — Mental health (Agent 3)"
R=$(curl -s -X POST "$BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "I feel very anxious and cannot sleep for 2 weeks"}')
run_test "response present" '"response"' "$R"
run_test "intent is mental" '"intent":"mental"' "$R"

echo ""
echo "[9/12] POST /api/health-score (Agent 4)"
R=$(curl -s -X POST "$BASE/api/health-score" \
  -H "Content-Type: application/json" \
  -d '{"sleep_hours": 5.5, "exercise_days_per_week": 1, "stress_level": 8.0, "smoker": true}')
run_test "health_result present" '"health_result"' "$R"

echo ""
echo "[10/12] POST /api/asha/assess — Routine case (Agent 6)"
R=$(curl -s -X POST "$BASE/api/asha/assess" \
  -H "Content-Type: application/json" \
  -d '{
    "asha_worker_id": "test-worker",
    "patient_id": "test-patient",
    "observations": "55 year old male, fever for 2 days, cough, no difficulty breathing",
    "user_district": "Vadodara"
  }')
run_test "asha_result present" '"asha_result"' "$R"
run_test "triage_decision present" 'triage_decision' "$R"

echo ""
echo "[11/12] POST /api/asha/assess — Urgent case (Agent 6)"
R=$(curl -s -X POST "$BASE/api/asha/assess" \
  -H "Content-Type: application/json" \
  -d '{
    "asha_worker_id": "test-worker",
    "patient_id": "test-patient-2",
    "observations": "Pregnant woman 8 months, severe headache, BP 160/100, swelling in feet",
    "user_district": "Vadodara"
  }')
run_test "asha_result present" '"asha_result"' "$R"
run_test "urgent referral" 'refer_urgent' "$R"

echo ""
echo "[12/12] POST /api/chat — Hindi symptoms (multilingual)"
R=$(curl -s -X POST "$BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "मुझे बुखार और सांस लेने में तकलीफ है", "user_district": "Vadodara"}')
run_test "response present" '"response"' "$R"

# ── Summary ─────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Results: $PASS passed, $FAIL failed"
echo "============================================"

if [ $FAIL -eq 0 ]; then
    echo "  All tests passed!"
else
    echo "  Some tests failed — check output above."
    echo "  Tests 5-12 require a valid OPENAI_API_KEY in .env"
fi
