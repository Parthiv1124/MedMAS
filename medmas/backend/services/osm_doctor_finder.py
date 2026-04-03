# backend/services/osm_doctor_finder.py
"""Fetch real nearby doctors from OpenStreetMap Overpass API."""

import math
import httpx

# Multiple public Overpass endpoints — tried in order until one responds
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
]

# Option C: progressive radius steps (km → metres)
# Tries smallest first; widens until doctors are found
RADIUS_STEPS = [5_000, 15_000, 30_000]

SPECIALITY_KEYWORDS = {
    "cardiology":       ["cardio", "heart", "cardiac"],
    "endocrinology":    ["diabet", "endocrin", "thyroid", "hormone"],
    "neurology":        ["neuro", "brain", "nerve"],
    "psychiatry":       ["psych", "mental", "counsel"],
    "dermatology":      ["skin", "derma"],
    "gynaecology":      ["gyn", "maternity", "obstetric", "women"],
    "obstetrics":       ["gyn", "maternity", "obstetric", "women"],
    "paediatrics":      ["paediatr", "pediatr", "child", "kids"],
    "orthopaedics":     ["ortho", "bone", "joint", "fracture"],
    "ophthalmology":    ["eye", "ophthal", "vision"],
    "ent":              ["ent", "ear", "nose", "throat"],
    "pulmonology":      ["pulmon", "lung", "chest", "respiratory"],
    "gastroenterology": ["gastro", "stomach", "liver", "digest"],
    "general":          ["clinic", "physician", "doctor", "general", "family", "primary",
                         "health", "medical", "nursing", "dispensary", "phc", "chc"],
}


def _build_query(lat: float, lon: float, radius: int) -> str:
    """
    Option A: broad set of OSM tags covering Indian healthcare facilities.
    Includes hospitals, clinics, doctors, health centres, pharmacies,
    and the generic healthcare=* tag used widely in rural India.
    """
    r = radius
    return f"""
[out:json][timeout:20];
(
  node["amenity"="doctors"](around:{r},{lat},{lon});
  way["amenity"="doctors"](around:{r},{lat},{lon});
  node["amenity"="clinic"](around:{r},{lat},{lon});
  way["amenity"="clinic"](around:{r},{lat},{lon});
  node["amenity"="hospital"](around:{r},{lat},{lon});
  way["amenity"="hospital"](around:{r},{lat},{lon});
  node["amenity"="health_post"](around:{r},{lat},{lon});
  way["amenity"="health_post"](around:{r},{lat},{lon});
  node["healthcare"="doctor"](around:{r},{lat},{lon});
  way["healthcare"="doctor"](around:{r},{lat},{lon});
  node["healthcare"="clinic"](around:{r},{lat},{lon});
  way["healthcare"="clinic"](around:{r},{lat},{lon});
  node["healthcare"="hospital"](around:{r},{lat},{lon});
  way["healthcare"="hospital"](around:{r},{lat},{lon});
  node["healthcare"="centre"](around:{r},{lat},{lon});
  way["healthcare"="centre"](around:{r},{lat},{lon});
  node["healthcare"="pharmacy"](around:{r},{lat},{lon});
  node["amenity"="pharmacy"](around:{r},{lat},{lon});
);
out center;
"""


def _normalize(element: dict) -> dict:
    tags = element.get("tags", {})
    name = tags.get("name") or tags.get("name:en") or tags.get("name:hi") or ""
    phone = (
        tags.get("phone") or
        tags.get("contact:phone") or
        tags.get("phone:mobile") or ""
    )
    address = tags.get("addr:full", "")
    if not address:
        parts = [
            tags.get("addr:housenumber", ""),
            tags.get("addr:street", ""),
            tags.get("addr:suburb", ""),
            tags.get("addr:city", ""),
        ]
        address = ", ".join(p for p in parts if p).strip(", ")

    return {
        "id":        element.get("id"),
        "name":      name,
        "lat":       element.get("lat") or (element.get("center", {}) or {}).get("lat"),
        "lon":       element.get("lon") or (element.get("center", {}) or {}).get("lon"),
        "specialty": tags.get("healthcare:speciality", tags.get("healthcare:specialty", "")),
        "phone":     phone,
        "address":   address,
        "type":      tags.get("amenity") or tags.get("healthcare", ""),
    }


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return round(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 2)


def _filter_by_specialty(doctors: list, specialty: str) -> list:
    keywords = SPECIALITY_KEYWORDS.get(specialty.lower(), [])
    if not keywords:
        return doctors
    matched = []
    for doc in doctors:
        name = doc["name"].lower()
        spec = doc["specialty"].lower()
        addr = doc["address"].lower()
        if any(kw in name or kw in spec or kw in addr for kw in keywords):
            matched.append(doc)
    return matched


async def _query_overpass(query: str) -> list:
    """Try each Overpass endpoint until one returns results."""
    async with httpx.AsyncClient(timeout=15) as client:
        for endpoint in OVERPASS_ENDPOINTS:
            try:
                resp = await client.post(endpoint, data={"data": query})
                if resp.status_code == 200:
                    data = resp.json()
                    elements = data.get("elements", [])
                    if elements:
                        return elements
            except Exception:
                continue
    return []


async def find_nearby_doctors(
    lat: float,
    lng: float,
    specialty: str = "General",
    radius: int = 5_000,
    limit: int = 5,
) -> list:
    """
    Fetch real nearby doctors using OSM Overpass API.

    Option A: broad tag set (hospitals, clinics, health centres, pharmacies,
              healthcare=* nodes common in rural India).
    Option C: progressive radius — tries 5km → 15km → 30km until results found.
    """
    elements = []

    # Option C: widen search radius progressively until we find something
    for step_radius in RADIUS_STEPS:
        if step_radius < radius:
            continue  # honour caller's minimum radius
        query = _build_query(lat, lng, step_radius)
        elements = await _query_overpass(query)
        if elements:
            print(f"[OSM] Found {len(elements)} facilities within {step_radius/1000:.0f}km of ({lat:.4f},{lng:.4f})")
            break
        print(f"[OSM] 0 results at {step_radius/1000:.0f}km, widening search...")

    if not elements:
        return []

    # Normalize & drop nameless entries
    doctors = [_normalize(el) for el in elements]
    doctors = [d for d in doctors if d["name"] and d["lat"] and d["lon"]]

    # Attach distance
    for doc in doctors:
        doc["distance_km"] = _haversine_km(lat, lng, doc["lat"], doc["lon"])

    # Sort by distance first
    doctors.sort(key=lambda d: d["distance_km"])

    # Try specialty-filtered results
    filtered = _filter_by_specialty(doctors, specialty)

    # If no specialty match, return nearest facilities (any type)
    if not filtered:
        filtered = doctors

    return filtered[:limit]
