# backend/services/pdf_parser.py
import fitz  # PyMuPDF
import re
import json
from config import LAB_RANGES_PATH

with open(LAB_RANGES_PATH) as f:
    LAB_RANGES = json.load(f)

EXTRACT_PATTERNS = {
    "HbA1c":             r"(?:HbA1[Cc]|Glycated\s+Hae?moglobin|A1[Cc])[\s:\-]*(\d+\.?\d*)",
    "fasting_glucose":   r"(?:Fasting\s+)?(?:Blood\s+)?(?:Glucose|Sugar|FBS|FBG|RBS|Blood\s+Sugar)[\s:\-]*(\d+\.?\d*)",
    "systolic_bp":       r"(?:BP|Blood\s*Pressure|Systolic)[\s:\-]*(\d{2,3})\s*/",
    "diastolic_bp":      r"(?:BP|Blood\s*Pressure)[\s:\-]*\d{2,3}\s*/\s*(\d{2,3})",
    "total_cholesterol": r"(?:Total\s+)?Cholesterol[\s:\-]*(\d+\.?\d*)",
    "HDL":               r"HDL[\s:\-]*(?:Cholesterol[\s:\-]*)?(\d+\.?\d*)",
    "LDL":               r"LDL[\s:\-]*(?:Cholesterol[\s:\-]*)?(\d+\.?\d*)",
    "BMI":               r"BMI[\s:\-]*(\d+\.?\d*)",
    "creatinine":        r"(?:Serum\s+)?Creatinine[\s:\-]*(\d+\.?\d*)",
    "hemoglobin":        r"(?:Hae?moglobin|Hb|HGB)[\s:\-]*(\d+\.?\d*)",
    "triglycerides":     r"Triglycerides?[\s:\-]*(\d+\.?\d*)",
    "urea":              r"(?:Blood\s+)?Urea[\s:\-]*(\d+\.?\d*)",
    "uric_acid":         r"Uric\s+Acid[\s:\-]*(\d+\.?\d*)",
    "TSH":               r"TSH[\s:\-]*(\d+\.?\d*)",
    "SGOT":              r"(?:SGOT|AST)[\s:\-]*(\d+\.?\d*)",
    "SGPT":              r"(?:SGPT|ALT)[\s:\-]*(\d+\.?\d*)",
    "platelets":         r"Platelet(?:s|\s+Count)?[\s:\-]*(\d+\.?\d*)",
    "WBC":               r"(?:WBC|White\s+Blood\s+Cell|Total\s+Leucocyte)[\s:\-]*(?:Count[\s:\-]*)?(\d+\.?\d*)",
    "RBC":               r"(?:RBC|Red\s+Blood\s+Cell)[\s:\-]*(?:Count[\s:\-]*)?(\d+\.?\d*)",
}

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    return "\n".join(page.get_text() for page in doc)

def parse_lab_values(text: str) -> dict:
    values = {}
    for metric, pattern in EXTRACT_PATTERNS.items():
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                values[metric] = float(match.group(1))
            except ValueError:
                pass
    return values

def flag_abnormal_values(lab_values: dict) -> dict:
    flags = {}
    for metric, value in lab_values.items():
        ranges = LAB_RANGES.get(metric)
        if not ranges:
            continue
        for status, bounds in ranges.items():
            in_range = True
            if "min" in bounds and value < bounds["min"]:
                in_range = False
            if "max" in bounds and value > bounds["max"]:
                in_range = False
            if in_range:
                flags[metric] = {"value": value, "status": status}
                break
    return flags

def process_lab_report(pdf_bytes: bytes) -> dict:
    text   = extract_text_from_pdf(pdf_bytes)
    values = parse_lab_values(text)
    flags  = flag_abnormal_values(values)
    return {"raw_text": text, "values": values, "flags": flags}
