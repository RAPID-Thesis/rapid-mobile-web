import { SyncQueueItem } from '../types';
import { getUserToken } from './auth';
import { buildApiUrl, fetchWithTimeout, parseApiError } from './api';

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
 * Saves the assessment via the FastAPI backend so images go to storage and
 * `process_assessment` runs ResNet + RF fusion + optional Gemini actions.
 */
export async function submitAssessmentForMlSync(input: WizardAssessmentSyncInput): Promise<unknown> {
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
