import type { Assessment, Building } from '../types';
import { formatPercent } from './formatPercent';
import { APP_NAME } from './branding';

/**
 * Build a FEMA P-154 / ATC-20 assessment record and hand it to the browser as a
 * downloaded .pdf.
 *
 * This replaces a `window.open` + `window.print()` approach with two problems:
 * popup blockers silently swallowed it (the old code did `if (!w) return`, so a
 * blocked popup was indistinguishable from a broken button), and even when it
 * worked the user landed in a print dialog instead of getting a file.
 */

const MARGIN = 56; // ~20mm at 72dpi
const LINE = 14;
const INK = '#0f172a';
const MUTED = '#64748b';
const BRAND = '#1b4d8e';
const RULE = '#cbd5e1';

interface Row {
  label: string;
  value: string;
}

export async function downloadAssessmentReport(
  assessment: Assessment,
  building: Building | null,
): Promise<void> {
  // Imported on demand: jsPDF is ~390 kB, and loading it with the Reports page
  // would slow a route most visits never generate a PDF from.
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;

  let y = MARGIN;

  /** Start a new page when the next block would overflow the bottom margin. */
  const ensureSpace = (needed: number) => {
    if (y + needed <= pageHeight - MARGIN) return;
    doc.addPage();
    y = MARGIN;
  };

  const heading = (text: string) => {
    ensureSpace(LINE * 2.5);
    y += LINE;
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(BRAND);
    doc.text(text.toUpperCase(), MARGIN, y);
    y += 6;
    doc.setDrawColor(RULE).setLineWidth(0.75);
    doc.line(MARGIN, y, MARGIN + contentWidth, y);
    y += LINE;
  };

  const labelWidth = 150;
  const table = (rows: Row[]) => {
    doc.setFontSize(10);
    for (const row of rows) {
      const valueLines = doc.splitTextToSize(row.value || '—', contentWidth - labelWidth - 12);
      const blockHeight = Math.max(LINE, valueLines.length * LINE);
      ensureSpace(blockHeight + 4);

      doc.setFont('helvetica', 'normal').setTextColor(MUTED);
      doc.text(row.label, MARGIN, y);

      doc.setFont('helvetica', 'bold').setTextColor(INK);
      doc.text(valueLines, MARGIN + labelWidth, y);

      y += blockHeight + 4;
    }
  };

  // --- Masthead -------------------------------------------------------------
  doc.setFillColor(BRAND);
  doc.rect(0, 0, pageWidth, 72, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor('#ffffff');
  doc.text(APP_NAME, MARGIN, 34);
  doc.setFont('helvetica', 'normal').setFontSize(9.5);
  doc.text('Rapid Visual Screening / Damage Assessment Record', MARGIN, 52);
  y = 72 + LINE * 2;

  const isPre = assessment.phase === 'pre-earthquake';
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(INK);
  doc.text(
    isPre ? 'FEMA P-154 Pre-Earthquake Screening' : 'ATC-20 Post-Earthquake Evaluation',
    MARGIN,
    y,
  );
  y += LINE;
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(MUTED);
  doc.text(`Generated ${new Date().toLocaleString()}  ·  Report ID ${assessment.id}`, MARGIN, y);
  y += LINE;

  // --- Classification callout ----------------------------------------------
  const classLabel = assessment.override_classification ?? assessment.ai_fused_label ?? 'Pending';
  const overridden = Boolean(assessment.override_classification);
  ensureSpace(64);
  y += 8;
  doc.setDrawColor(RULE).setLineWidth(1);
  doc.roundedRect(MARGIN, y, contentWidth, 54, 4, 4, 'S');
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(MUTED);
  doc.text(overridden ? 'ENGINEER DETERMINATION' : 'AI CLASSIFICATION', MARGIN + 14, y + 18);
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(INK);
  doc.text(String(classLabel).toUpperCase(), MARGIN + 14, y + 42);
  if (assessment.ai_fused_confidence != null) {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED);
    doc.text(
      `Model confidence ${formatPercent(assessment.ai_fused_confidence)}`,
      MARGIN + contentWidth - 14,
      y + 42,
      { align: 'right' },
    );
  }
  y += 54;

  // --- Body -----------------------------------------------------------------
  heading('Building');
  table([
    { label: 'Building code', value: building?.building_code ?? '—' },
    { label: 'Address', value: building?.address ?? '—' },
    { label: 'Barangay', value: building?.barangay ?? '—' },
    { label: 'Municipality', value: building?.municipality ?? '—' },
    { label: 'Occupancy', value: String(building?.building_use ?? '—') },
    { label: 'Storeys', value: building?.number_of_stories?.toString() ?? '—' },
    { label: 'Year built', value: building?.year_built?.toString() ?? '—' },
  ]);

  heading('Assessment');
  const assessmentRows: Row[] = [
    { label: 'Phase', value: isPre ? 'Pre-Earthquake (FEMA P-154)' : 'Post-Earthquake (ATC-20)' },
    { label: 'Status', value: assessment.status },
    { label: 'Priority score', value: formatPercent(assessment.priority_score, 0) },
  ];
  if (assessment.ai_image_label) {
    assessmentRows.push({
      label: 'Image branch',
      value: `${assessment.ai_image_label}${
        assessment.ai_image_confidence != null
          ? ` (${formatPercent(assessment.ai_image_confidence)})`
          : ''
      }`,
    });
  }
  if (assessment.ai_tabular_label) {
    assessmentRows.push({
      label: 'Structural branch',
      value: `${assessment.ai_tabular_label}${
        assessment.ai_tabular_confidence != null
          ? ` (${formatPercent(assessment.ai_tabular_confidence)})`
          : ''
      }`,
    });
  }
  if (assessment.ai_fusion_weights) {
    assessmentRows.push({
      label: 'Fusion weighting',
      value: `${(assessment.ai_fusion_weights.image * 100).toFixed(0)}% image / ${(
        assessment.ai_fusion_weights.tabular * 100
      ).toFixed(0)}% structural`,
    });
  }
  if (overridden) {
    assessmentRows.push({
      label: 'Engineer override',
      value: `${assessment.override_classification} — ${
        assessment.review_justification ?? 'No justification recorded.'
      }`,
    });
  }
  table(assessmentRows);

  const recommendations = assessment.action_recommendations ?? [];
  if (recommendations.length > 0) {
    heading('Recommended actions');
    doc.setFontSize(10);
    recommendations.forEach((item, i) => {
      const lines = doc.splitTextToSize(item, contentWidth - 20);
      ensureSpace(lines.length * LINE + 4);
      doc.setFont('helvetica', 'bold').setTextColor(BRAND);
      doc.text(`${i + 1}.`, MARGIN, y);
      doc.setFont('helvetica', 'normal').setTextColor(INK);
      doc.text(lines, MARGIN + 20, y);
      y += lines.length * LINE + 4;
    });
  }

  const structural = assessment.structural_data ?? {};
  const structuralRows = Object.entries(structural)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => ({ label: humanizeKey(k), value: String(v) }));
  if (structuralRows.length > 0) {
    heading('Structural data submitted');
    table(structuralRows);
  }

  heading('Disclaimer');
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(MUTED);
  const disclaimer = doc.splitTextToSize(
    'This document is generated for LGU operational use. The classification is an ' +
      'AI-assisted screening and does not constitute a structural certification. Final ' +
      'determination requires a licensed structural engineer following FEMA P-154 / ATC-20 ' +
      'protocols.',
    contentWidth,
  );
  ensureSpace(disclaimer.length * 11 + 4);
  doc.text(disclaimer, MARGIN, y, { lineHeightFactor: 1.3 });

  // --- Page furniture -------------------------------------------------------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(MUTED);
    doc.text(`Page ${i} of ${pages}`, pageWidth - MARGIN, pageHeight - 28, { align: 'right' });
    doc.text(`${APP_NAME} · ${building?.building_code ?? assessment.id}`, MARGIN, pageHeight - 28);
  }

  const safeCode = (building?.building_code ?? assessment.id).replace(/[^a-zA-Z0-9._-]/g, '-');
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`${APP_NAME}-${isPre ? 'P154' : 'ATC20'}-${safeCode}-${stamp}.pdf`);
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}
