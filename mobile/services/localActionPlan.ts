/**
 * On-device action plan templates — mirrors backend/app/services/gemini_planner.py fallback.
 * Used when offline so inspectors get immediate FEMA P-154 / ATC-20 guidance in the field.
 */

import type { AssessmentPhase } from '../types';

export type LocalActionPlanSource = 'device-template';

export interface LocalActionPlanResult {
  recommendations: string[];
  generatedBy: LocalActionPlanSource;
}

const DISCLAIMER =
  'This is an AI-assisted screening. Final certification requires a licensed structural engineer following FEMA P-154 / ATC-20 protocols.';

const TEMPLATES: Record<string, string[]> = {
  'pre:low': [
    'Document baseline condition with dated photos and structural drawings on file.',
    'Schedule routine inspections every 24 months per LGU policy.',
    'Verify emergency exits, fire extinguishers, and evacuation signage are intact.',
    'Encourage occupants to secure heavy furniture and non-structural elements.',
    'Reassess if any renovation or change of occupancy is planned.',
  ],
  'pre:moderate': [
    'Commission a qualitative FEMA P-154 Level-1 screening within 60 days.',
    'Inspect for early signs of settlement, cracking, and corrosion at connections.',
    'Develop a prioritized retrofit plan (soft-story bracing, infill walls, tie beams).',
    'Brief occupants on earthquake drills and identify refuge zones inside the building.',
    'Escalate to engineer review if cracking or tilt is observed on re-inspection.',
  ],
  'pre:high': [
    'Restrict high-occupancy use until a detailed vulnerability assessment is performed.',
    'Engage a licensed structural engineer for ATC-20 / FEMA P-154 Level-2 evaluation within 30 days.',
    'Prepare a retrofitting scope: foundation strengthening, shear-wall addition, or base isolation as warranted.',
    'Install monitoring (tilt meters, crack gauges) if retrofit is deferred.',
    'Coordinate with the LGU/DRRMO for inclusion in the barangay risk registry.',
  ],
  'post:SAFE': [
    'Post a GREEN ATC-20 placard; normal occupancy may resume.',
    'Photograph any hairline cracking observed for future reference.',
    'Remind occupants to report new cracks, water intrusion, or unusual sounds.',
    'Re-inspect within 30 days or immediately after aftershocks ≥ magnitude 5.0.',
    'File the assessment with the LGU for the post-event registry.',
  ],
  'post:RESTRICTED': [
    'Post a YELLOW ATC-20 placard; limit entry to essential, short-duration activities.',
    'Cordon off damaged areas (shear walls, staircases, overhangs) with barrier tape.',
    'Schedule a detailed ATC-20 Level-2 evaluation within 7 days.',
    'Document the earthquake-induced damage with dated photos at every angle captured.',
    'Coordinate temporary relocation of vulnerable occupants (children, elderly) with the barangay.',
  ],
  'post:UNSAFE': [
    'Post a RED ATC-20 placard; prohibit entry and cordon the immediate perimeter.',
    'Evacuate all occupants and coordinate temporary shelter with the LGU/DRRMO.',
    'Request an urgent structural engineer inspection within 24 hours.',
    'Shut off utilities (gas, water, electrical) to the structure as a safety precaution.',
    'Plan for demolition, shoring, or major retrofit pending the engineer\'s report.',
  ],
};

function phaseKey(phase: AssessmentPhase | 'pre' | 'post'): 'pre' | 'post' {
  if (phase === 'pre' || phase === 'pre-earthquake') return 'pre';
  return 'post';
}

export function generateLocalActionPlan(params: {
  phase: AssessmentPhase | 'pre' | 'post';
  label: string;
  confidence?: number;
}): LocalActionPlanResult {
  const pk = phaseKey(params.phase);
  const key = `${pk}:${params.label}`;
  const items = TEMPLATES[key];
  if (!items) {
    return {
      recommendations: [
        `Review the ${pk}-earthquake assessment with a qualified engineer.`,
        'Cross-check the AI classification against on-site observations.',
        'Document findings and escalate per LGU DRRMO protocol.',
        DISCLAIMER,
      ],
      generatedBy: 'device-template',
    };
  }
  return {
    recommendations: [...items, DISCLAIMER],
    generatedBy: 'device-template',
  };
}

/** Same severity × confidence formula as backend ml_fusion_engine.process_assessment. */
export function computeLocalPriorityScore(label: string, confidence: number): number {
  const severity: Record<string, number> = {
    low: 0.3,
    moderate: 0.6,
    high: 1.0,
    SAFE: 0.3,
    RESTRICTED: 0.6,
    UNSAFE: 1.0,
  };
  return Math.round((severity[label] ?? 0.5) * confidence * 10000) / 10000;
}
