# backend/services/pdf_parser.py
import fitz  # PyMuPDF
import re
import json
import base64
import httpx
from config import (
    LAB_RANGES_PATH,
    openai_client,
    VLM_MODEL,
    LLAMAPARSER_API_URL,
    LLAMAPARSER_API_KEY,
    LLAMAPARSER_PARSER_ID,
)
try:
    from PIL import Image
    import pytesseract
except ImportError:
    pytesseract = None

VLM_EXTRACT_PROMPT = """You are a medical lab report analyst. Analyze the uploaded PDF lab report and extract ALL numerical lab values found.

Return ONLY a valid JSON object with exact field names. Include any of these fields that are present:
- HbA1c, fasting_glucose, random_glucose, post_prandial_glucose
- systolic_bp, diastolic_bp
- total_cholesterol, HDL, LDL, triglycerides
- hemoglobin, RBC, WBC, platelets
- creatinine, urea, uric_acid
- sodium, potassium, chloride, bicarbonate
- calcium, phosphorus, magnesium
- iron, ferritin, TIBC
- vitamin_D, vitamin_B12, folate
- TSH, T3, T4
- SGOT, SGPT, alkaline_phosphatase, bilirubin, albumin, total_protein
- pH, specific_gravity (urine)

Return format:
{
  "values": {"field_name": numeric_value, ...},
  "report_summary": "brief summary of what this report contains"
}

If no lab values found, return: {"values": {}, "report_summary": "No lab values detected"}"""

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


def _ocr_pdf_text(pdf_bytes: bytes) -> str:
    if not pytesseract:
        return ""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages_text = []
    for page in doc:
        pix = page.get_pixmap(alpha=False)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        try:
            text = pytesseract.image_to_string(img, lang="eng")
        except pytesseract.pytesseract.TesseractNotFoundError:
            print("[PDFParser] Tesseract binary not found; skipping OCR.")
            return ""
        pages_text.append(text)
    return "\n".join(pages_text)

def parse_lab_values(text: str) -> dict:
    values = {}
    # Normalize comma decimals (e.g., 7,2 -> 7.2) without affecting thousands separators
    normalized = re.sub(r"(?<=\\d),(?=\\d)", ".", text)
    for metric, pattern in EXTRACT_PATTERNS.items():
        match = re.search(pattern, normalized, re.IGNORECASE)
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

def _normalize_numeric_value(val):
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        return float(val.replace(",", "."))
    return None


def _extract_with_vlm(pdf_bytes: bytes) -> dict:
    """Extract lab values using Qwen3-VL vision model - converts PDF to images first."""
    import httpx
    
    # Convert PDF pages to images
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    all_values = {}
    report_summaries = []
    
    for page_num, page in enumerate(doc):
        try:
            pix = page.get_pixmap(alpha=False)
            img_bytes = pix.tobytes("jpeg")
            b64_img = base64.b64encode(img_bytes).decode()
            data_url = f"data:image/jpeg;base64,{b64_img}"
            
            response = openai_client.chat.completions.create(
                model=VLM_MODEL,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": VLM_EXTRACT_PROMPT},
                            {"type": "image_url", "image_url": {"url": data_url}},
                        ],
                    }
                ],
                max_tokens=2048,
                temperature=0.1,
            )
            content = response.choices[0].message.content
            if not content:
                continue
            content = content.strip()
            
            # Extract JSON from response
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            
            parsed = json.loads(content.strip())
            page_values = parsed.get("values", {})
            
            # Merge values (avoid duplicates by preferring non-zero values)
            for k, v in page_values.items():
                normalized_val = _normalize_numeric_value(v)
                if normalized_val is not None:
                    if k not in all_values or all_values[k] == 0:
                        all_values[k] = normalized_val
                    elif normalized_val != 0:
                        all_values[k] = normalized_val
            
            if parsed.get("report_summary"):
                report_summaries.append(parsed.get("report_summary"))
                
        except Exception as e:
            print(f"[PDFParser-VLM] Error on page {page_num}: {e}")
            continue
    
    doc.close()
    
    if all_values:
        print(f"[PDFParser-VLM] Extracted {len(all_values)} values from {len(report_summaries)} pages")
        return {"values": all_values, "report_summary": " | ".join(report_summaries) if report_summaries else ""}
    
    return {"values": {}, "report_summary": ""}


def _call_llamaparser(text: str) -> dict:
    if not (LLAMAPARSER_API_URL and LLAMAPARSER_API_KEY and LLAMAPARSER_PARSER_ID and text):
        return {}
    try:
        payload = {
            "input": {
                "documents": [
                    {
                        "text": text,
                        "metadata": {"source": "lab_report"},
                    }
                ]
            }
        }
        payload["parser_id"] = LLAMAPARSER_PARSER_ID
        headers = {
            "Authorization": f"Bearer {LLAMAPARSER_API_KEY}",
            "Content-Type": "application/json",
        }
        response = httpx.post(
            LLAMAPARSER_API_URL,
            headers=headers,
            json=payload,
            timeout=60.0,
        )
        if response.status_code != 200:
            print(
                f"[PDFParser] LlamaParser HTTP {response.status_code}: {response.text[:200]}"
            )
            response.raise_for_status()
        payload = response.json()
        raw_values = payload.get("values") or {}
        if not raw_values and payload.get("results"):
            for result in payload["results"]:
                raw_values.update(result.get("values") or {})
        converted = {}
        for metric, value in raw_values.items():
            normalized = _normalize_numeric_value(value)
            if normalized is not None:
                converted[metric] = normalized
        if converted:
            print(f"[PDFParser] LlamaParser returned {len(converted)} metrics: {list(converted.keys())}")
        return converted
    except httpx.HTTPStatusError as exc:
        print(f"[PDFParser] LlamaParser request failed: {exc}")
    except Exception as exc:
        print(f"[PDFParser] LlamaParser request error: {exc}")
    return {}


def process_lab_report(pdf_bytes: bytes) -> dict:
    """Process lab report PDF using VLM model first, then fallbacks."""
    # Step 1: Try VLM extraction (Qwen3-VL)
    vlm_result = _extract_with_vlm(pdf_bytes)
    if vlm_result.get("values"):
        values = vlm_result["values"]
        flags = flag_abnormal_values(values)
        raw_text = f"[VLM] {vlm_result.get('report_summary', '')}"
        print(f"[PDFParser] VLM extracted {len(values)} values")
        return {"raw_text": raw_text, "values": values, "flags": flags, "extraction_method": "vlm"}
    
    # Step 2: Fallback to LlamaParser
    text = extract_text_from_pdf(pdf_bytes)
    values = _call_llamaparser(text)
    if values:
        flags = flag_abnormal_values(values)
        text = "[LlamaParser]\n" + text
        return {"raw_text": text, "values": values, "flags": flags, "extraction_method": "llamaparser"}
    
    # Step 3: Fallback to regex parsing
    values = parse_lab_values(text)
    flags  = flag_abnormal_values(values)
    if not values and pytesseract:
        ocr_text = _ocr_pdf_text(pdf_bytes)
        if ocr_text:
            values = parse_lab_values(ocr_text)
            flags  = flag_abnormal_values(values)
            text += "\n\n[OCR]\n" + ocr_text
    
    return {"raw_text": text, "values": values, "flags": flags, "extraction_method": "regex"}
