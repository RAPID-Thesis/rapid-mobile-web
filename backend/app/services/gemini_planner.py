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

# Which protocol governs which phase. These are not interchangeable: FEMA P-154 is a
# *pre-event* rapid visual screening that scores vulnerability, while ATC-20 is a
# *post-event* safety evaluation that decides whether a damaged building may be
# entered. Placards belong to ATC-20 only -- posting one off the back of a
# pre-earthquake screening would assert a post-event safety determination nobody made.
_PROTOCOL = {
    "pre": "FEMA P-154 (Rapid Visual Screening of Buildings for Potential Seismic Hazards)",
    "post": "ATC-20 (Procedures for Post-earthquake Safety Evaluation of Buildings)",
}

# ATC-20 posting outcomes. The colour is not decoration -- it is the legal posting
# the evaluation produces, and it must follow the classification exactly.
_PLACARD = {
    "SAFE": ("GREEN", "INSPECTED", "normal occupancy may resume"),
    "RESTRICTED": ("YELLOW", "RESTRICTED USE", "entry limited to short, essential visits"),
    "UNSAFE": ("RED", "UNSAFE", "entry prohibited until an engineer clears the structure"),
}

_PROMPT_BASE = """You are an assistant for the RAPID Seismic Assessment platform, used by
local government DRRMO staff and building inspectors in San Jose del Monte, Bulacan,
Philippines.

Write concise, prioritized action items for the assessment described below. Rules:

- 4-6 numbered items, each a single sentence in imperative voice
- every item must be an action someone can take this week, with a timeframe where
  the protocol specifies one
- stay inside the governing protocol named below; do not invent thresholds,
  placard colours, or inspection intervals it does not define
- refer to Philippine practice where it matters (barangay, LGU/DRRMO, NSCP)
- do not recommend re-occupancy, repair, or demolition beyond what the
  classification supports
- end with a short disclaimer that this is AI-assisted and that final
  certification requires a licensed structural engineer
"""

_PRE_RULES = """Governing protocol: {protocol}.

This is a PRE-earthquake vulnerability screening. The building has not been through a
damaging event, so:
- do NOT post or mention an ATC-20 placard; placards are post-event only
- frame follow-up as FEMA P-154 Level 1 / Level 2 screening, retrofit prioritisation,
  and non-structural mitigation
- the classification "{label}" is a vulnerability rating, not a damage state
"""

_POST_RULES = """Governing protocol: {protocol}.

This is a POST-earthquake safety evaluation. The classification "{label}" corresponds to
an ATC-20 {colour} "{posting}" placard, meaning {meaning}.

- the FIRST item must be to post the {colour} ATC-20 placard and state the entry
  restriction it carries
- keep every later item consistent with that restriction; never suggest occupancy or
  activity the placard forbids
- reference ATC-20 Level 2 (detailed) evaluation where escalation is warranted
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


# Stored labels are not consistent -- a record carries whichever vocabulary the model
# that wrote it used, and an engineer override always writes ATC-20 terms. Looking a
# raw label up against a phase-keyed table therefore missed on any mismatch and
# silently dropped the building to the generic three-line plan. Normalise through the
# shared severity axis first, exactly as the portal does when it renders the label.
_SEVERITY_BY_LABEL = {
    "low": "safe", "safe": "safe",
    "moderate": "restricted", "restricted": "restricted",
    "high": "unsafe", "unsafe": "unsafe",
}

_LABEL_BY_PHASE = {
    "pre": {"safe": "low", "restricted": "moderate", "unsafe": "high"},
    "post": {"safe": "SAFE", "restricted": "RESTRICTED", "unsafe": "UNSAFE"},
}


def _canonical_label(phase: str, label: str) -> str | None:
    """The label rewritten into the vocabulary its phase actually uses."""
    severity = _SEVERITY_BY_LABEL.get((label or "").strip().lower())
    if severity is None:
        return None
    return _LABEL_BY_PHASE[phase][severity]


def _violates_protocol(phase: str, label: str, items: list[str]) -> str | None:
    """Reject a plan that contradicts the governing protocol.

    A generated plan is advice an inspector may act on, so a wrong placard is worse
    than no Gemini plan at all -- the device's protocol template is always available
    to fall back to.
    """
    text = " ".join(items).lower()
    if phase == "post":
        colour = _PLACARD[label][0].lower()
        if colour not in text:
            return f"missing the required {colour.upper()} ATC-20 placard"
        wrong = [c for c in ("green", "yellow", "red") if c != colour and f"{c} atc-20" in text]
        if wrong:
            return f"names a {wrong[0].upper()} placard alongside the required {colour.upper()}"
        if label == "UNSAFE" and ("may resume" in text or "resume normal occupancy" in text):
            return "permits re-occupancy of an UNSAFE building"
    elif "placard" in text:
        return "posts an ATC-20 placard for a pre-earthquake screening"
    return None


def _fallback(phase: str, label: str) -> list[str]:
    key = (phase, _canonical_label(phase, label) or label)
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

    if phase == "post":
        colour, posting, meaning = _PLACARD[label]
        rules = _POST_RULES.format(
            protocol=_PROTOCOL["post"], label=label, colour=colour,
            posting=posting, meaning=meaning,
        )
    else:
        rules = _PRE_RULES.format(protocol=_PROTOCOL["pre"], label=label)

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
    site = _site_context(building)
    if site:
        context = f"{context} {site}"

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=model_name,
            contents=(
                f"{_PROMPT_BASE}\n{rules}\nContext:\n{context}\n\n"
                "Produce the recommendations now."
            ),
        )
        text = (response.text or "").strip()
    except Exception as exc:
        logger.warning("Gemini call failed, falling back to templates: %s", exc)
        return None

    items = _parse_numbered_list(text)
    if not items:
        return None

    breach = _violates_protocol(phase, label, items)
    if breach:
        logger.warning(
            "Discarding Gemini plan for a %s/%s assessment: it %s. Using the protocol template.",
            phase, label, breach,
        )
        return None

    if _DISCLAIMER not in " ".join(items):
        items.append(_DISCLAIMER)
    return items


def _site_context(building: dict[str, Any]) -> str:
    """Site factors the screening actually turns on, when the record carries them."""
    bits = []
    soil = building.get("soil_classification")
    if soil:
        bits.append(f"Site soil class: {soil}.")
    fault = building.get("distance_to_fault_km")
    if isinstance(fault, (int, float)):
        bits.append(f"Distance to nearest mapped fault: {fault:.1f} km.")
    system = building.get("structural_system")
    if system:
        bits.append(f"Structural system: {system}.")
    return " ".join(bits)


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
    # Normalise once, up front: everything downstream keys off the phase's own
    # vocabulary, and an ATC-20 label arriving on a pre-earthquake record (or the
    # reverse) would otherwise miss both the placard table and the templates.
    canonical = _canonical_label(phase, label)
    if canonical is None:
        logger.warning("Unrecognised classification %r for a %s assessment.", label, phase)
        return {"recommendations": _fallback(phase, label), "generated_by": "template-fallback"}

    gemini_items = _try_gemini(phase, canonical, confidence, building)
    if gemini_items:
        return {"recommendations": gemini_items, "generated_by": "gemini"}
    return {"recommendations": _fallback(phase, canonical), "generated_by": "template-fallback"}


__all__ = ["generate_action_plan"]
