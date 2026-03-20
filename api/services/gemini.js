/**
 * Gemini API service for action plan generation.
 * Falls back to template-based recommendations if Gemini is unavailable.
 */

const TEMPLATE_PRE_EQ = [
  '1. [High] Conduct detailed structural assessment by licensed engineer.',
  '2. [Medium] Review and reinforce foundation connections.',
  '3. [Medium] Consider retrofitting non-structural elements (e.g., parapets, appendages).',
  '4. [Low] Document building condition and maintain inspection records.',
  '5. [Disclaimer] These recommendations require professional review before implementation.',
];

const TEMPLATE_POST_EQ = [
  '1. [High] Restrict occupancy until engineer clearance is obtained.',
  '2. [High] Secure hazardous areas and cordon off if unstable.',
  '3. [Medium] Schedule emergency structural inspection.',
  '4. [Medium] Document damage with photos for insurance and repair planning.',
  '5. [Disclaimer] These recommendations require professional review before implementation.',
];

/**
 * Generate template-based recommendations (fallback when Gemini API unavailable).
 */
function getTemplateRecommendations(phase) {
  const isPost = phase === 'post-earthquake';
  return {
    recommendations: isPost ? TEMPLATE_POST_EQ : TEMPLATE_PRE_EQ,
    generatedBy: 'template-fallback',
    generatedAt: new Date(),
  };
}

/**
 * Generate action plan using Gemini API.
 * Fallback to template if API key missing or request fails.
 */
async function generateActionPlan(assessment) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return getTemplateRecommendations(assessment.phase || 'pre-earthquake');
  }

  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const phase = assessment.phase || 'pre-earthquake';
    const classification =
      assessment.aiResult?.fusedClassification?.label ||
      assessment.aiResult?.tabularClassification?.label ||
      assessment.aiResult?.imageClassification?.label ||
      'Unknown';

    const building = assessment.building || {};
    const structural = assessment.structuralData || {};

    const prompt = `You are a structural engineering assistant for seismic assessment. Generate a concise action plan for a building assessment.

**Phase:** ${phase}
**Risk classification:** ${classification}
**Building:** ${building.buildingUse || 'residential'}, ${building.numberOfStories || '?'} stories, built ${building.yearBuilt || 'unknown'}, ${building.structuralSystem || 'unknown'} structure
**Structural data:** Material: ${structural.material || 'unknown'}, Condition: ${structural.condition || 'unknown'}, Irregularities: ${(structural.irregularities || []).join(', ') || 'none'}

**Requirements:**
- Output 4-6 numbered action items with priority [High], [Medium], or [Low].
- For pre-earthquake: focus on retrofitting and preparedness.
- For post-earthquake: focus on safety, evacuation, and repair priorities.
- End with: "[Disclaimer] These recommendations require professional review before implementation."

Format each item as: "N. [Priority] Action description."
Return only the list, no extra text.`;

    // Default matches @google/genai README; override with GEMINI_MODEL. Avoid gemini-2.0-flash if
    // your AI Studio project has no free-tier quota for that model (common 429 RESOURCE_EXHAUSTED).
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    const text = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const lines = text
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const recommendations = lines.length > 0 ? lines : getTemplateRecommendations(phase).recommendations;

    return {
      recommendations,
      generatedBy: 'gemini',
      generatedAt: new Date(),
    };
  } catch (err) {
    const detail = err?.message || String(err);
    console.error('Gemini API error:', detail);
    return getTemplateRecommendations(assessment.phase || 'pre-earthquake');
  }
}

module.exports = { generateActionPlan, getTemplateRecommendations };
