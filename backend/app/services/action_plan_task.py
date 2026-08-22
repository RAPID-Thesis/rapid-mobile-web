"""Online-only enrichment of a synced assessment's action plan.

The phone ships a FEMA/ATC-20 template plan with every assessment so an inspector
has guidance without a network. When the record reaches the server we can do
better: Gemini writes a plan referencing the specific building. That is the only
work the backend does after a sync, and it deliberately never touches the
classification -- the device's verdict is final.

Kept free of any TensorFlow/scikit-learn import so the API container does not need
the ML stack.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

logger = logging.getLogger(__name__)


async def enrich_action_plan(assessment_id: UUID) -> None:
    """Replace a device-generated template plan with a Gemini-authored one."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from ..models import Assessment, SessionLocal
    from .gemini_planner import generate_action_plan

    db = SessionLocal()
    try:
        assessment = db.scalar(
            select(Assessment)
            .options(selectinload(Assessment.building))
            .where(Assessment.id == assessment_id)
        )
        if assessment is None:
            logger.warning("enrich_action_plan: assessment %s not found", assessment_id)
            return
        if not assessment.ai_fused_label:
            logger.info("enrich_action_plan: %s has no classification, skipping", assessment_id)
            return

        building = assessment.building
        # Site factors drive the screening, so the plan should know them. They live on
        # the building row only when something populated it; what the inspector
        # actually recorded is in the assessment's field form, so read that as well.
        field = assessment.structural_data or {}
        result = generate_action_plan(
            phase="pre" if assessment.phase == "pre-earthquake" else "post",
            label=assessment.ai_fused_label,
            confidence=assessment.ai_fused_confidence or 0.0,
            building={
                "building_code": building.building_code,
                "address": building.address,
                "barangay": building.barangay,
                "municipality": building.municipality,
                "year_built": building.year_built,
                "number_of_stories": building.number_of_stories,
                "building_use": building.building_use,
                "soil_classification": building.soil_classification or field.get("soilClass"),
                "distance_to_fault_km": (
                    building.distance_to_fault_km
                    if building.distance_to_fault_km is not None
                    else field.get("distance_to_fault_km")
                ),
                "structural_system": building.structural_system or field.get("structuralSystem"),
            },
        )

        # Only overwrite when Gemini actually answered. A template-fallback here is
        # no better than the template the device already wrote offline, and
        # replacing it would just churn the row.
        if result["generated_by"] != "gemini":
            logger.info(
                "enrich_action_plan: %s kept the device plan (Gemini unavailable)",
                assessment_id,
            )
            return

        assessment.action_recommendations = result["recommendations"]
        assessment.action_generated_by = "gemini"
        assessment.action_generated_at = datetime.now(timezone.utc)
        assessment.updated_at = datetime.now(timezone.utc)
        db.commit()
        logger.info("enrich_action_plan: %s upgraded to a Gemini plan", assessment_id)
    except Exception:
        db.rollback()
        # The classification is already stored and correct; a failed plan upgrade
        # must not surface as a sync failure to the inspector.
        logger.exception("enrich_action_plan failed for %s", assessment_id)
    finally:
        db.close()
