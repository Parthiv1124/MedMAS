# backend/services/doctor_finder.py
import pandas as pd
from config import DOCTORS_CSV_PATH

doctors_df = pd.read_csv(DOCTORS_CSV_PATH)

def find_doctors(specialty: str, district: str = "", limit: int = 3) -> list:
    """
    Filter doctors.csv by specialty and district.
    Falls back to any doctor with that specialty if no district match.
    """
    specialty = (specialty or "General").lower()
    district = (district or "").lower()

    filtered = doctors_df[
        (doctors_df["specialty"].str.lower() == specialty) &
        (doctors_df["district"].str.lower() == district)
    ] if district else pd.DataFrame()

    if filtered.empty:
        filtered = doctors_df[
            doctors_df["specialty"].str.lower() == specialty
        ]
    return filtered.head(limit).to_dict(orient="records")
