import type { Assessment, Building } from '../types';
import { formatPercent } from './formatPercent';

/** Browser “Save as PDF” / print — FEMA P-154–style layout (MVP). */
export function openPrintableAssessmentReport(
  assessment: Assessment,
  building: Building | null
): void {
  const classLabel =
    assessment.override_classification ?? assessment.ai_fused_label ?? 'Pending';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>RAPID RVS Report — ${building?.building_code ?? assessment.id}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 24px auto; color: #111; }
    h1 { font-size: 1.35rem; border-bottom: 2px solid #1e3a5f; padding-bottom: 8px; }
    h2 { font-size: 1rem; margin-top: 1.25rem; color: #1e3a5f; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; }
    .muted { color: #64748b; font-size: 0.8rem; }
    .banner { background: #1e3a5f; color: #fff; padding: 12px 16px; margin: -24px -24px 16px -24px; }
    @media print { body { margin: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="banner">
    <strong>RAPID</strong> — Rapid Visual Screening / Damage Assessment (MVP)
  </div>
  <h1>FEMA P-154 / ATC-20 Assessment Summary</h1>
  <p class="muted">Generated ${new Date().toLocaleString()} · Report ID: ${assessment.id}</p>

  <h2>Building</h2>
  <table>
    <tr><th>Building code</th><td>${escapeHtml(building?.building_code ?? '—')}</td></tr>
    <tr><th>Address</th><td>${escapeHtml(building?.address ?? '—')}</td></tr>
    <tr><th>Barangay / Municipality</th><td>${escapeHtml(building?.barangay ?? '—')} / ${escapeHtml(building?.municipality ?? '—')}</td></tr>
    <tr><th>Use / Stories</th><td>${escapeHtml(String(building?.building_use ?? '—'))} / ${building?.number_of_stories ?? '—'}</td></tr>
  </table>

  <h2>Assessment</h2>
  <table>
    <tr><th>Phase</th><td>${assessment.phase === 'pre-earthquake' ? 'Pre-Earthquake (FEMA P-154)' : 'Post-Earthquake (ATC-20)'}</td></tr>
    <tr><th>Status</th><td>${escapeHtml(assessment.status)}</td></tr>
    <tr><th>AI fused classification</th><td><strong>${escapeHtml(classLabel)}</strong>${assessment.ai_fused_confidence != null ? ` (${formatPercent(assessment.ai_fused_confidence)} confidence)` : ''}</td></tr>
    <tr><th>Priority score</th><td>${formatPercent(assessment.priority_score, 0)}</td></tr>
    ${assessment.override_classification ? `<tr><th>Engineer override</th><td>${escapeHtml(assessment.override_classification)} — ${escapeHtml(assessment.review_justification ?? '')}</td></tr>` : ''}
  </table>

  <h2>Structural data (submitted)</h2>
  <pre style="white-space: pre-wrap; font-size: 0.8rem; background: #f8fafc; padding: 12px; border: 1px solid #e2e8f0;">${escapeHtml(JSON.stringify(assessment.structural_data ?? {}, null, 2))}</pre>

  <h2>Disclaimer</h2>
  <p class="muted">This document is generated for LGU operational use. AI outputs and recommendations require review by a licensed structural engineer. QR / digital signature placeholders may be added in a future release.</p>

  <p class="no-print muted" style="margin-top: 24px;">Use your browser: Print → Save as PDF.</p>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
