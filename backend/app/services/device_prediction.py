"""Persist the classification the phone produced.

The device is the sole classifier. It runs the same fused ResNet50 + Random Forest
pipeline the server used to, but against geo features from its bundled
`sjdm_geo.json` rather than server-side SRTM tiles and the PHIVOLCS shapefile.
Re-running inference here would therefore return a *different* answer than the one
the inspector was shown in the field -- which is exactly what used to happen, on
every single sync.

So this module stores what the device decided and computes nothing.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - import only for type checking
    from ..models import Assessment
    from ..schemas import DevicePrediction

# Mirrors the severity weighting the server pipeline used, so priority ordering on
# the dashboard is unchanged for records synced by either app version.
_SEVERITY = {
    "low": 0.3, "moderate": 0.6, "high": 1.0,
    "SAFE": 0.3, "RESTRICTED": 0.6, "UNSAFE": 1.0,
}


def apply_device_prediction(assessment: Assessment, prediction: DevicePrediction) -> None:
    """Copy a device-computed classification onto an assessment row, in place."""
    assessment.ai_image_label = prediction.image_label
    assessment.ai_image_confidence = prediction.image_confidence
    assessment.ai_image_probabilities = prediction.image_probabilities
    assessment.ai_tabular_label = prediction.tabular_label
    assessment.ai_tabular_confidence = prediction.tabular_confidence
    assessment.ai_tabular_probabilities = prediction.tabular_probabilities
    assessment.ai_fused_label = prediction.fused_label
    assessment.ai_fused_confidence = prediction.fused_confidence

    if prediction.fusion_weights:
        assessment.ai_fusion_weights = prediction.fusion_weights

    # Note: there is no column for the *fused* distribution -- the schema only has
    # per-branch probabilities. The fused label and confidence are stored above; the
    # fused vector is not persisted. Adding `ai_fused_probabilities` would be a
    # one-column migration if the dashboard ever needs to chart it.

    if prediction.action_plan and prediction.action_plan.recommendations:
        assessment.action_recommendations = prediction.action_plan.recommendations
        assessment.action_generated_by = prediction.action_plan.generated_by
        assessment.action_generated_at = datetime.now(timezone.utc)

    if prediction.priority_score is not None:
        assessment.priority_score = round(prediction.priority_score, 4)
    else:
        severity = _SEVERITY.get(prediction.fused_label, 0.5)
        assessment.priority_score = round(prediction.fused_confidence * severity, 4)

    assessment.status = "pending-review"
    assessment.updated_at = datetime.now(timezone.utc)
