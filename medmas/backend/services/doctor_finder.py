# backend/services/doctor_finder.py
import pandas as pd
from config import DOCTORS_CSV_PATH

doctors_df = pd.read_csv(DOCTORS_CSV_PATH)

def find_doctors(specialty: str, district: str = "", limit: int = 3) -> list:
    """
    Filter doctors.csv by specialty and/or district.
    Pass specialty="" to match any specialty.
    """
    specialty = (specialty or "").lower()
    district = (district or "").lower()

    df = doctors_df.copy()
    if district:
        df = df[df["district"].str.lower() == district]
    if specialty:
        df = df[df["specialty"].str.lower() == specialty]

    return df.head(limit).to_dict(orient="records")
