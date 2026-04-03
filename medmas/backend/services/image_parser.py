# backend/services/image_parser.py
import base64
from config import openai_client


VISION_MODEL = "meta-llama/Llama-3.2-11B-Vision-Instruct"

SYSTEM_PROMPT = (
    "You are a medical document reader. Extract ALL text, numbers, values, "
    "and findings visible in this medical image (lab report, prescription, "
    "X-ray, scan, etc.). If it is a photo of a body part or skin condition, "
    "describe what you observe in clinical terms. "
    "Return ONLY the extracted/observed content, no commentary."
)


def extract_text_from_image(image_bytes: bytes, content_type: str = "image/jpeg") -> str:
    """Use a vision model to extract text/findings from a medical image."""
    b64 = base64.b64encode(image_bytes).decode()
    data_url = f"data:{content_type};base64,{b64}"

    try:
        response = openai_client.chat.completions.create(
            model=VISION_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": SYSTEM_PROMPT},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            ],
            max_tokens=1024,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"[Could not process image: {e}]"
