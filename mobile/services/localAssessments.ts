import type { OutboxItem } from './outbox';
import type { LocalActionPlanResult } from './localActionPlan';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True when the id is a server-side Supabase/Postgres UUID (not a local outbox id). */
export function isServerAssessmentId(id: string): boolean {
  return UUID_RE.test(id);
}

export interface LocalAssessmentListRow {
  id: string;
  isLocal: true;
  building_code: string;
  address: string;
  phase: string;
  status: 'pending-sync' | 'syncing' | 'upload-failed';
  ai_fused_label: string;
  ai_fused_confidence: number;
  priority_score: number;
  created_at: string;
  syncStatus: OutboxItem['status'];
  prediction_source: 'device-ml-fusion' | 'device-offline-heuristic';
}

export function outboxToListRow(item: OutboxItem): LocalAssessmentListRow {
  const syncStatus = item.status;
  const status: LocalAssessmentListRow['status'] =
    syncStatus === 'syncing'
      ? 'syncing'
      : syncStatus === 'failed'
        ? 'upload-failed'
        : 'pending-sync';

  return {
    id: item.id,
    isLocal: true,
    building_code: item.input.building_code,
    address: item.input.address,
    phase: item.input.phase,
    status,
    ai_fused_label: item.localPrediction.fusedLabel,
    ai_fused_confidence: item.localPrediction.fusedConfidence,
    priority_score: item.localPriorityScore ?? 0,
    created_at: item.createdAt,
    syncStatus: item.status,
    prediction_source: item.localPrediction.source,
  };
}

export function getLocalActionPlan(item: OutboxItem): LocalActionPlanResult {
  return item.localActionPlan!;
}

export function getLocalPriorityScore(item: OutboxItem): number {
  return item.localPriorityScore ?? 0;
}
