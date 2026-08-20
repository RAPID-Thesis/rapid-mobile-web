import { SyncQueueItem } from '../types';
import { getUserToken } from './auth';
import { buildApiUrl, fetchWithTimeout, parseApiError } from './api';
import type { LocalPredictionResult } from './localPredict';
import type { LocalActionPlanResult } from './localActionPlan';

/** Mirrors the backend `DevicePrediction` schema. snake_case: this is the wire. */
export interface DevicePredictionPayload {
  phase: 'pre' | 'post';
  fused_label: string;
  fused_confidence: number;
  probabilities: Record<string, number>;
  image_label: string | null;
  image_confidence: number | null;
  image_probabilities?: Record<string, number> | null;
  tabular_label: string | null;
  tabular_confidence: number | null;
  tabular_probabilities?: Record<string, number> | null;
  fusion_weights?: { image: number; tabular: number } | null;
  source: 'device-ml-fusion' | 'device-offline-heuristic';
  priority_score?: number | null;
  action_plan?: { recommendations: string[]; generated_by: 'device-local' } | null;
}

/** Matches backend `AssessmentSyncPayload` (snake_case, phase = pre-earthquake | post-earthquake). */
interface BackendAssessmentPayload {
  building_code: string;
  address: string;
  barangay: string;
  municipality: string;
  longitude: number;
  latitude: number;
  building_use: string;
  number_of_stories: number;
  year_built: number | null;
  phase: 'pre-earthquake' | 'post-earthquake';
  structural_data: Record<string, unknown>;
  /** The verdict the phone reached in the field. The server stores it as-is. */
  device_prediction?: DevicePredictionPayload;
}

export interface WizardAssessmentSyncInput {
  building_code: string;
  address: string;
  barangay: string;
  municipality: string;
  longitude: number;
  latitude: number;
  building_use: string;
  number_of_stories: number;
  year_built: number | null;
  phase: 'pre-earthquake' | 'post-earthquake';
  structural_data: Record<string, unknown>;
  imageUris: string[];
}

function guessMimeType(uri: string): string {
  const normalizedUri = uri.toLowerCase();

  if (normalizedUri.endsWith('.png')) {
    return 'image/png';
  }

  if (normalizedUri.endsWith('.webp')) {
    return 'image/webp';
  }

  return 'image/jpeg';
}

function buildFilename(uri: string, index: number): string {
  const uriParts = uri.split('/');
  const lastSegment = uriParts[uriParts.length - 1];
  return lastSegment || `assessment-image-${index + 1}.jpg`;
}

export function buildAssessmentPayloadFromQueueItem(item: SyncQueueItem): BackendAssessmentPayload {
  const phase =
    item.assessmentPayload.phase === 'post-earthquake' ? 'post-earthquake' : 'pre-earthquake';
  return {
    building_code: (item.assessmentPayload as { buildingCode?: string }).buildingCode
      ?? item.assessmentPayload.buildingId
      ?? `RADAR-${item.queueId}`,
    address: 'Queued from mobile device for backend sync',
    barangay: 'TBD Barangay',
    municipality: '',
    longitude: 0,
    latitude: 0,
    building_use: 'residential',
    number_of_stories: 1,
    year_built: null,
    phase,
    structural_data: {
      primary_material: 'Reinforced Concrete',
      structural_system: 'Moment Resisting Frame',
      soil_class: 'D',
      topography: 'Flat',
      irregularity_vertical: 'none',
      irregularity_plan: 'none',
      hazard_pounding: 'none',
      hazard_falling: 'none',
    },
  };
}

/**
 * Saves the assessment via the FastAPI backend: images go to storage and the
 * device's classification is stored verbatim. The server does not re-classify --
 * doing so used to change the result the inspector saw in the field.
 */
/**
 * Convert the on-device result into the wire shape. camelCase locally, snake_case
 * on the API boundary -- the two must not be blurred.
 */
export function toDevicePredictionPayload(
  prediction: LocalPredictionResult,
  actionPlan?: LocalActionPlanResult,
  priorityScore?: number
): DevicePredictionPayload {
  return {
    phase: prediction.phase,
    fused_label: prediction.fusedLabel,
    fused_confidence: prediction.fusedConfidence,
    probabilities: prediction.probabilities,
    image_label: prediction.imageLabel,
    image_confidence: prediction.imageConfidence,
    image_probabilities: prediction.imageProbabilities ?? null,
    tabular_label: prediction.tabularLabel,
    tabular_confidence: prediction.tabularConfidence,
    tabular_probabilities: prediction.tabularProbabilities ?? null,
    fusion_weights: prediction.fusionWeights ?? null,
    source: prediction.source,
    priority_score: priorityScore ?? null,
    action_plan: actionPlan
      ? { recommendations: actionPlan.recommendations, generated_by: 'device-local' }
      : null,
  };
}

export async function submitAssessmentForMlSync(
  input: WizardAssessmentSyncInput,
  devicePrediction?: DevicePredictionPayload
): Promise<unknown> {
  const token = await getUserToken();
  if (!token) {
    throw new Error('No authentication token found. Please sign in again before saving.');
  }

  const payload: BackendAssessmentPayload = {
    building_code: input.building_code,
    address: input.address,
    barangay: input.barangay,
    municipality: input.municipality,
    longitude: input.longitude,
    latitude: input.latitude,
    building_use: input.building_use,
    number_of_stories: input.number_of_stories,
    year_built: input.year_built,
    phase: input.phase,
    structural_data: input.structural_data,
    device_prediction: devicePrediction,
  };

  const formData = new FormData();
  formData.append('assessment', JSON.stringify(payload));

  input.imageUris.forEach((uri, index) => {
    formData.append(
      'images',
      {
        uri,
        name: buildFilename(uri, index),
        type: guessMimeType(uri),
      } as any
    );
  });

  const url = buildApiUrl('/api/assessments/sync');
  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Cannot reach backend at ${url}. ${m} — Is uvicorn running (--host 0.0.0.0 --port 8000), firewall open, and phone on same Wi‑Fi?`
    );
  }

  if (!response.ok) {
    throw new Error(await parseApiError(response, 'Assessment sync failed.'));
  }

  return response.json();
}

export async function syncAssessmentQueueItem(item: SyncQueueItem): Promise<unknown> {
  const token = await getUserToken();
  if (!token) {
    throw new Error('No authentication token found. Please sign in again before syncing.');
  }

  const formData = new FormData();
  formData.append('assessment', JSON.stringify(buildAssessmentPayloadFromQueueItem(item)));

  item.imageFiles.forEach((uri, index) => {
    formData.append(
      'images',
      {
        uri,
        name: buildFilename(uri, index),
        type: guessMimeType(uri),
      } as any
    );
  });

  const url = buildApiUrl('/api/assessments/sync');
  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Cannot reach backend at ${url}. ${m} — Is uvicorn running (--host 0.0.0.0 --port 8000), firewall open, and phone on same Wi‑Fi?`
    );
  }

  if (!response.ok) {
    throw new Error(await parseApiError(response, 'Assessment sync failed.'));
  }

  return response.json();
}
