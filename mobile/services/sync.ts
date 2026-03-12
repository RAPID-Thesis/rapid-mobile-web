import { SyncQueueItem } from '../types';
import { getUserToken } from './auth';
import { buildApiUrl, parseApiError } from './api';

interface BackendAssessmentPayload {
  building_code: string;
  address: string;
  barangay: string;
  building_use: string;
  phase: 'Pre-Earthquake' | 'Post-Earthquake';
  structural_data: {
    primary_material: string;
    structural_system: string;
    soil_class: string;
    topography: string;
    irregularity_vertical: string;
    irregularity_plan: string;
    hazard_pounding: string;
    hazard_falling: string;
  };
  status: 'pending_ml_review';
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
  return {
    building_code: item.assessmentPayload.buildingId ?? `RADAR-${item.queueId}`,
    address: 'Queued from mobile device for backend sync',
    barangay: 'TBD Barangay',
    building_use: 'residential',
    phase: item.assessmentPayload.phase === 'post-earthquake' ? 'Post-Earthquake' : 'Pre-Earthquake',
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
    status: 'pending_ml_review',
  };
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

  const response = await fetch(buildApiUrl('/api/assessments/sync'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, 'Assessment sync failed.'));
  }

  return response.json();
}
