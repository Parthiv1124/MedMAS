#!/bin/bash
# MedMAS — 5-Minute Demo Script
# Usage: cd medmas && bash demo.sh

BASE="${1:-http://localhost:8000}"

echo "============================================"
echo "  MedMAS Demo — Multi-Agent AI Health System"
echo "============================================"
echo ""

echo "DEMO 1: Patient Journey"
echo "========================"
echo ""

echo "Step 1: Hindi symptoms → Agent 1 Symptom Checker"
echo "Input: मुझे पिछले 1 हफ्ते से बहुत थकान है, बार बार पेशाब आता है"
echo "---"
curl -s -X POST "$BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"मुझे पिछले 1 हफ्ते से बहुत थकान है, बार बार पेशाब आता है, और आँखें धुंधली हो गई हैं","user_district":"Vadodara"}' | python -m json.tool 2>/dev/null || echo "(raw output above)"
echo ""

echo "Step 2: Lab values → Agent 2 Disease Predictor"
echo "Input: My HbA1c is 8.2 and Blood Pressure is 150/95"
echo "---"
curl -s -X POST "$BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"My HbA1c is 8.2 and Blood Pressure is 150/95","user_district":"Surat"}' | python -m json.tool 2>/dev/null || echo "(raw output above)"
echo ""

echo "Step 3: Mental health → Agent 3 Empathy + Cross-Agent Alert"
echo "Input: I am under a lot of stress and cannot sleep"
echo "---"
curl -s -X POST "$BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"I am under a lot of stress at home and cannot sleep well. I feel very low.","user_district":"Vadodara"}' | python -m json.tool 2>/dev/null || echo "(raw output above)"
echo ""

echo ""
echo "DEMO 2: ASHA Worker Impact"
echo "==========================="
echo ""

echo "Step 4: Urgent — Pregnant woman with high BP → Agent 6 ASHA Copilot"
echo "---"
curl -s -X POST "$BASE/api/asha/assess" \
  -H "Content-Type: application/json" \
  -d '{"asha_worker_id":"demo","patient_id":"demo","observations":"34 year old woman, 8 months pregnant, complaining of severe headache since morning, legs are swollen, BP seems high","user_district":"Vadodara"}' | python -m json.tool 2>/dev/null || echo "(raw output above)"
echo ""

echo "Step 5: Hindi child case → Agent 6 ASHA Copilot"
echo "---"
curl -s -X POST "$BASE/api/asha/assess" \
  -H "Content-Type: application/json" \
  -d '{"asha_worker_id":"asha-worker-1","patient_id":"child-patient-1","observations":"बच्चा 2 साल का, तेज बुखार 3 दिन से, पतले दस्त, खाना-पानी नहीं ले रहा, रो नहीं रहा","user_district":"Bharuch"}' | python -m json.tool 2>/dev/null || echo "(raw output above)"
echo ""

echo "============================================"
echo "  Demo complete!"
echo "============================================"
