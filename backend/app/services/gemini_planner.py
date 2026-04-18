"""
Action-plan generator backed by Google Gemini with a deterministic template fallback.

Used by :mod:`ml_fusion_engine.process_assessment` once the fused label is known.
Output is a list of numbered, actionable bullets plus a ``generated_by`` tag that is
either ``"gemini"`` or ``"template-fallback"``.
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

_PROMPT_SYSTEM = """You are an assistant for the RAPID Seismic Assessment platform (Philippines).
You write concise, prioritized action items for building inspectors and LGU staff
based on an AI-classified seismic risk level. Responses must:

- be 4-6 numbered items, each one sentence, imperative voice
- reference FEMA P-154 / ATC-20 conventions where relevant
- end with a short disclaimer that this is AI-assisted and requires a licensed
  structural engineer for final certification
"""

_FALLBACK_TEMPLATES: dict[tuple[str, str], list[str]] = {
    # Pre-earthquake
    ("pre", "low"): [
        "Document baseline condition with dated photos and structural drawings on file.",
        "Schedule routine inspections every 24 months per LGU policy.",
        "Verify emergency exits, fire extinguishers, and evacuation signage are intact.",
        "Encourage occupants to secure heavy furniture and non-structural elements.",
        "Reassess if any renovation or change of occupancy is planned.",
    ],
    ("pre", "moderate"): [
        "Commission a qualitative FEMA P-154 Level-1 screening within 60 days.",
        "Inspect for early signs of settlement, cracking, and corrosion at connections.",
        "Develop a prioritized retrofit plan (soft-story bracing, infill walls, tie beams).",
        "Brief occupants on earthquake drills and identify refuge zones inside the building.",
        "Escalate to engineer review if cracking or tilt is observed on re-inspection.",
    ],
    ("pre", "high"): [
        "Restrict high-occupancy use until a detailed vulnerability assessment is performed.",
        "Engage a licensed structural engineer for ATC-20 / FEMA P-154 Level-2 evaluation within 30 days.",
        "Prepare a retrofitting scope: foundation strengthening, shear-wall addition, or base isolation as warranted.",
        "Install monitoring (tilt meters, crack gauges) if retrofit is deferred.",
        "Coordinate with the LGU/DRRMO for inclusion in the barangay risk registry.",
    ],
    # Post-earthquake
    ("post", "SAFE"): [
        "Post a GREEN ATC-20 placard; normal occupancy may resume.",
        "Photograph any hairline cracking observed for future reference.",
        "Remind occupants to report new cracks, water intrusion, or unusual sounds.",
        "Re-inspect within 30 days or immediately after aftershocks ≥ magnitude 5.0.",
        "File the assessment with the LGU for the post-event registry.",
    ],
    ("post", "RESTRICTED"): [
        "Post a YELLOW ATC-20 placard; limit entry to essential, short-duration activities.",
        "Cordon off damaged areas (shear walls, staircases, overhangs) with barrier tape.",
        "Schedule a detailed ATC-20 Level-2 evaluation within 7 days.",
        "Document the earthquake-induced damage with dated photos at every angle captured.",
        "Coordinate temporary relocation of vulnerable occupants (children, elderly) with the barangay.",
    ],
    ("post", "UNSAFE"): [
        "Post a RED ATC-20 placard; prohibit entry and cordon the immediate perimeter.",
        "Evacuate all occupants and coordinate temporary shelter with the LGU/DRRMO.",
        "Request an urgent structural engineer inspection within 24 hours.",
        "Shut off utilities (gas, water, electrical) to the structure as a safety precaution.",
        "Plan for demolition, shoring, or major retrofit pending the engineer's report.",
    ],
}

_DISCLAIMER = (
    "This is an AI-assisted screening. Final certification requires a licensed "
    "structural engineer following FEMA P-154 / ATC-20 protocols."
)


def _fallback(phase: str, label: str) -> list[str]:
    key = (phase, label)
    items = _FALLBACK_TEMPLATES.get(key)
    if items is None:
        return [
            f"Review the {phase}-earthquake assessment with a qualified engineer.",
            "Cross-check the AI classification against on-site observations.",
            "Document findings and escalate per LGU DRRMO protocol.",
            _DISCLAIMER,
        ]
    return [*items, _DISCLAIMER]


def _try_gemini(phase: str, label: str, confidence: float, building: dict[str, Any]) -> list[str] | None:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None

    try:
        from google import genai  # noqa: WPS433
    except ImportError:
        logger.warning("google-genai not installed; using template fallback.")
        return None

    model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    context = (
        f"Phase: {phase}-earthquake. "
        f"AI-classified label: {label}. "
        f"Model confidence: {confidence:.2%}. "
        f"Building: {building.get('building_code')} at {building.get('address')}, "
        f"{building.get('barangay')}, {building.get('municipality')}. "
        f"Year built: {building.get('year_built') or 'unknown'}. "
        f"Stories: {building.get('number_of_stories')}. "
        f"Use: {building.get('building_use')}."
    )

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=model_name,
            contents=f"{_PROMPT_SYSTEM}\n\nContext:\n{context}\n\nProduce the recommendations now.",
        )
        text = (response.text or "").strip()
    except Exception as exc:
        logger.warning("Gemini call failed, falling back to templates: %s", exc)
        return None

    items = _parse_numbered_list(text)
    if not items:
        return None
    if _DISCLAIMER not in " ".join(items):
        items.append(_DISCLAIMER)
    return items


def _parse_numbered_list(text: str) -> list[str]:
    """Extract clean ``"1. ..."`` / ``"- ..."`` items from an LLM response."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    out: list[str] = []
    for ln in lines:
        # Strip leading "1.", "1)", "-", "*"
        stripped = ln
        for prefix in range(1, 20):
            for sep in (".", ")", ":"):
                token = f"{prefix}{sep}"
                if stripped.startswith(token):
                    stripped = stripped[len(token):].strip()
                    break
        if stripped.startswith(("-", "*", "•")):
            stripped = stripped[1:].strip()
        if stripped:
            out.append(stripped)
    return out


def generate_action_plan(
    *,
    phase: str,
    label: str,
    confidence: float,
    building: dict[str, Any],
) -> dict[str, Any]:
    """Return ``{"recommendations": [...], "generated_by": "gemini"|"template-fallback"}``."""
    gemini_items = _try_gemini(phase, label, confidence, building)
    if gemini_items:
        return {"recommendations": gemini_items, "generated_by": "gemini"}
    return {"recommendations": _fallback(phase, label), "generated_by": "template-fallback"}


__all__ = ["generate_action_plan"]
