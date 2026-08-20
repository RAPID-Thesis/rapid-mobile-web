#!/usr/bin/env python3
"""
Seed demo buildings + assessments across San Jose del Monte, Bulacan for heatmap demos.

Uses DATABASE_URL from backend/.env (Supabase Postgres). All rows use building_code
prefix DEMO-SJDM- so --clear only removes demo data.

Usage:
  cd backend && .venv/Scripts/activate
  python ../scripts/seed_demo_assessments.py --count 40
  python ../scripts/seed_demo_assessments.py --clear --count 40
  python ../scripts/seed_demo_assessments.py --inspector-email you@example.com --seed 42
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")

from sqlalchemy import delete, select  # noqa: E402

from app.models import Assessment, Building, Profile, SessionLocal  # noqa: E402

DEMO_CODE_PREFIX = "DEMO-SJDM-"
MUNICIPALITY = "San Jose del Monte"

# Matches web/src/constants/sjdmLocations.ts (heatmap barangay filters use exact strings).
SJDM_BARANGAYS: list[str] = [
    "Poblacion",
    "Poblacion 1",
    "Francisco Homes – Narra",
    "Francisco Homes – Mulawin",
    "Francisco Homes – Yakal",
    "Francisco Homes – Guijo",
    "Gumaok East",
    "Gumaok West",
    "Gumaok Central",
    "Graceville",
    "Gaya-gaya",
    "Sto. Cristo",
    "Tungkong Mangga",
    "Dulong Bayan",
    "Ciudad Real",
    "Maharlika",
    "San Manuel",
    "Kaypian",
    "San Isidro",
    "San Roque",
    "Kaybanban",
    "Paradise III",
    "Muzon Proper",
    "Muzon East",
    "Muzon West",
    "Muzon South",
    "Minuyan Proper",
    "Minuyan I",
    "Minuyan II",
    "Minuyan III",
    "Minuyan IV",
    "Minuyan V",
    "Bagong Buhay I",
    "Bagong Buhay II",
    "Bagong Buhay III",
    "San Martin I",
    "San Martin II",
    "San Martin III",
    "San Martin IV",
    "Sta. Cruz I",
    "Sta. Cruz II",
    "Sta. Cruz III",
    "Sta. Cruz IV",
    "Sta. Cruz V",
    "Fatima I",
    "Fatima II",
    "Fatima III",
    "Fatima IV",
    "Fatima V",
    "Citrus",
    "San Pedro",
    "Sapang Palay Proper",
    "San Martin De Porres",
    "Assumption",
    "Sto. Nino I",
    "Sto. Nino II",
    "Lawang Pare",
    "San Rafael I",
    "San Rafael II",
    "San Rafael III",
    "San Rafael IV",
    "San Rafael V",
]

# Slightly tighter than full SJDM_BOUNDS for scatter inside the city proper.
LAT_MIN, LAT_MAX = 14.78, 14.86
LNG_MIN, LNG_MAX = 121.02, 121.12

PRE_LABELS = ("low", "moderate", "high")
POST_LABELS = ("SAFE", "RESTRICTED", "UNSAFE")
STATUSES = ("pending-review", "reviewed", "report-generated")

SEVERITY = {
    "low": 0.3,
    "moderate": 0.6,
    "high": 1.0,
    "SAFE": 0.3,
    "RESTRICTED": 0.6,
    "UNSAFE": 1.0,
}

MATERIALS = (
    "Concrete Hollow Block (CHB)",
    "Reinforced Concrete (RC)",
    "Light Wood Frame",
)
STRUCTURAL_SYSTEMS = (
    "Moment Resisting Frame",
    "Shear Wall System",
    "Unreinforced Masonry",
)


def soil_class_for_elevation(elev_m: float) -> str:
    """NEHRP letter from SJDM soil-map elevation bands (synthetic_data.py)."""
    if elev_m < 80:
        return "D"
    if elev_m < 160:
        return "C"
    return "C"


def pseudo_elevation_m(lat: float) -> float:
    """Rough elevation proxy from latitude within SJDM (higher north / inland)."""
    t = (lat - LAT_MIN) / (LAT_MAX - LAT_MIN)
    return 40.0 + t * 140.0 + random.uniform(-15, 15)


def priority_from_label_confidence(label: str, confidence: float) -> float:
    return round(confidence * SEVERITY.get(label, 0.5), 4)


def resolve_inspector_id(db, email: str | None) -> uuid.UUID:
    if email:
        row = db.scalar(select(Profile.id).where(Profile.email == email))
        if row is None:
            raise SystemExit(f"No profile found for email: {email}")
        return row
    row = db.scalar(select(Profile.id).order_by(Profile.created_at.asc()).limit(1))
    if row is None:
        raise SystemExit(
            "No profiles in database. Register a user in the app first, or pass --inspector-email."
        )
    return row


def clear_demo_rows(db) -> int:
    codes = db.scalars(
        select(Building.building_code).where(Building.building_code.like(f"{DEMO_CODE_PREFIX}%"))
    ).all()
    if not codes:
        return 0
    result = db.execute(
        delete(Building).where(Building.building_code.like(f"{DEMO_CODE_PREFIX}%"))
    )
    db.commit()
    return result.rowcount or 0


def pick_label(phase: str, rng: random.Random) -> str:
    if phase == "pre-earthquake":
        return rng.choices(PRE_LABELS, weights=[0.35, 0.4, 0.25], k=1)[0]
    return rng.choices(POST_LABELS, weights=[0.4, 0.35, 0.25], k=1)[0]


def build_structural_data(rng: random.Random, soil: str, stories: int, year: int) -> dict:
    return {
        "stories": str(stories),
        "yearBuilt": str(year),
        "primaryMaterial": rng.choice(MATERIALS),
        "structuralSystem": rng.choice(STRUCTURAL_SYSTEMS),
        "soilClass": f"Type {soil} - Dense Soil" if soil == "C" else f"Type {soil} - Stiff Soil",
        "topography": rng.choice(["Flat", "Gentle Slope", "Steep Hill"]),
        "condition": rng.choice(
            [
                "Good - minor hairline cracks",
                "Moderate cracking on walls",
                "Visible damage to non-structural elements",
            ]
        ),
        "verticalIrregularity": rng.random() < 0.15,
        "planIrregularity": rng.random() < 0.12,
        "poundingHazard": rng.random() < 0.1,
        "fallingHazard": rng.random() < 0.08,
        "demo_seed": True,
    }


def seed_demo_assessments(
    count: int,
    *,
    clear: bool,
    inspector_email: str | None,
    seed: int | None,
) -> None:
    rng = random.Random(seed)

    db = SessionLocal()
    try:
        inspector_id = resolve_inspector_id(db, inspector_email)
        profile = db.get(Profile, inspector_id)
        print(f"Inspector: {profile.email if profile else inspector_id}")

        if clear:
            removed = clear_demo_rows(db)
            print(f"Cleared {removed} demo building(s) (assessments cascade).")

        now = datetime.now(timezone.utc)
        label_counts: Counter[str] = Counter()
        barangay_counts: Counter[str] = Counter()
        phase_counts: Counter[str] = Counter()

        for i in range(1, count + 1):
            barangay = rng.choice(SJDM_BARANGAYS)
            lat = round(rng.uniform(LAT_MIN, LAT_MAX), 6)
            lng = round(rng.uniform(LNG_MIN, LNG_MAX), 6)
            elev = pseudo_elevation_m(lat)
            soil = soil_class_for_elevation(elev)
            stories = rng.randint(1, 3)
            year = rng.randint(1970, 2026)
            phase = rng.choice(["pre-earthquake", "post-earthquake"])
            label = pick_label(phase, rng)
            confidence = round(rng.uniform(0.55, 0.95), 4)
            priority = priority_from_label_confidence(label, confidence)
            status = rng.choice(STATUSES)
            created_at = now - timedelta(days=rng.randint(0, 90), hours=rng.randint(0, 23))

            building = Building(
                building_code=f"{DEMO_CODE_PREFIX}{i:03d}",
                address=f"{rng.randint(1, 999)} {barangay} St., {MUNICIPALITY}",
                barangay=barangay,
                municipality=MUNICIPALITY,
                latitude=lat,
                longitude=lng,
                building_use="residential",
                number_of_stories=stories,
                year_built=year,
                structural_system=rng.choice(STRUCTURAL_SYSTEMS),
                soil_classification=soil,
                distance_to_fault_km=round(rng.uniform(2.0, 18.0), 2),
                previous_retrofit=rng.random() < 0.08,
                created_by=inspector_id,
                created_at=created_at,
                updated_at=created_at,
            )
            db.add(building)
            db.flush()

            structural_data = build_structural_data(rng, soil, stories, year)
            assessment = Assessment(
                building_id=building.id,
                inspector_id=inspector_id,
                phase=phase,
                structural_data=structural_data,
                ai_fused_label=label,
                ai_fused_confidence=confidence,
                ai_fusion_weights={"image": 0.45, "tabular": 0.55},
                ai_tabular_label=label,
                ai_tabular_confidence=round(confidence * rng.uniform(0.9, 1.0), 4),
                priority_score=priority,
                status=status,
                created_at=created_at,
                updated_at=created_at,
            )
            db.add(assessment)

            label_counts[label] += 1
            barangay_counts[barangay] += 1
            phase_counts[phase] += 1

        db.commit()
        print(f"\nInserted {count} demo building(s) + assessment(s).")
        print(f"Phase mix: {dict(phase_counts)}")
        print(f"Label mix: {dict(label_counts)}")
        print(f"Unique barangays: {len(barangay_counts)}")
        print("\nRefresh the web heatmap — markers need ai_fused_label and non-zero lat/lng.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed SJDM demo assessments for heatmap.")
    parser.add_argument("--count", type=int, default=40, help="Number of demo buildings/assessments.")
    parser.add_argument(
        "--clear",
        action="store_true",
        help=f"Delete existing rows with building_code like {DEMO_CODE_PREFIX}% before insert.",
    )
    parser.add_argument(
        "--inspector-email",
        type=str,
        default=None,
        help="Profile email to attribute assessments to (default: earliest profile).",
    )
    parser.add_argument("--seed", type=int, default=None, help="RNG seed for reproducible demo data.")
    args = parser.parse_args()

    if args.count < 1:
        raise SystemExit("--count must be at least 1")

    seed_demo_assessments(
        args.count,
        clear=args.clear,
        inspector_email=args.inspector_email,
        seed=args.seed,
    )


if __name__ == "__main__":
    main()
