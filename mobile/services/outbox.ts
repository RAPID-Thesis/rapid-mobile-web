import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

import type { LocalActionPlanResult } from './localActionPlan';
import {
  computeLocalPriorityScore,
  generateLocalActionPlan,
} from './localActionPlan';
import type { LocalPredictionResult } from './localPredict';
import { isApiUrlConfigured } from './api';
import { getUserToken } from './auth';
import type { LocationFix } from './location';
import {
  submitAssessmentForMlSync,
  toDevicePredictionPayload,
  type WizardAssessmentSyncInput,
} from './sync';

const STORAGE_KEY = 'rapid_assessment_outbox_v1';
let outboxRun: Promise<void> | null = null;

export interface OutboxItem {
  id: string;
  createdAt: string;
  input: WizardAssessmentSyncInput;
  localPrediction: LocalPredictionResult;
  /** On-device FEMA/ATC-20 action items — available immediately without network. */
  localActionPlan?: LocalActionPlanResult;
  localPriorityScore?: number;
  status: 'pending' | 'syncing' | 'failed';
  attempts: number;
  lastError?: string;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Fill action plan / priority for outbox items saved before offline action plans shipped. */
function hydrateOutboxItem(item: OutboxItem): OutboxItem {
  let localActionPlan = item.localActionPlan;
  let localPriorityScore = item.localPriorityScore;

  if (!localActionPlan) {
    localActionPlan = generateLocalActionPlan({
      phase: item.localPrediction.phase,
      label: item.localPrediction.fusedLabel,
      confidence: item.localPrediction.fusedConfidence,
    });
  }
  if (localPriorityScore == null) {
    localPriorityScore = computeLocalPriorityScore(
      item.localPrediction.fusedLabel,
      item.localPrediction.fusedConfidence
    );
  }

  if (localActionPlan === item.localActionPlan && localPriorityScore === item.localPriorityScore) {
    return item;
  }
  return { ...item, localActionPlan, localPriorityScore };
}

async function readAll(): Promise<OutboxItem[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as OutboxItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(items: OutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const items = await readAll();
  return items.map(hydrateOutboxItem).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getOutboxItem(id: string): Promise<OutboxItem | null> {
  const items = await readAll();
  const found = items.find((i) => i.id === id);
  return found ? hydrateOutboxItem(found) : null;
}

export async function getPendingOutboxCount(): Promise<number> {
  const items = await readAll();
  return items.length;
}

export async function enqueueOutbox(item: Omit<OutboxItem, 'id' | 'createdAt' | 'status' | 'attempts'>): Promise<OutboxItem> {
  const full: OutboxItem = {
    ...item,
    id: newId(),
    createdAt: new Date().toISOString(),
    status: 'pending',
    attempts: 0,
  };
  const items = await readAll();
  items.push(full);
  await writeAll(items);
  return full;
}

async function replaceItem(updated: OutboxItem): Promise<void> {
  const items = await readAll();
  const idx = items.findIndex((i) => i.id === updated.id);
  if (idx === -1) return;
  items[idx] = updated;
  await writeAll(items);
}

export async function removeOutbox(id: string): Promise<void> {
  const items = (await readAll()).filter((i) => i.id !== id);
  await writeAll(items);
}

export function isMissingGps(item: OutboxItem): boolean {
  return item.input.latitude === 0 && item.input.longitude === 0;
}

/** Attach a GPS fix to a queued assessment so sync can proceed. */
export async function updateOutboxGps(id: string, fix: LocationFix): Promise<OutboxItem | null> {
  const items = await readAll();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;

  const item = items[idx];
  const structural_data = {
    ...item.input.structural_data,
    gps_accuracy_m: fix.accuracy_m,
    gps_captured_at: fix.capturedAt,
  };

  const updated: OutboxItem = {
    ...item,
    input: {
      ...item.input,
      latitude: fix.latitude,
      longitude: fix.longitude,
      structural_data,
    },
    status: 'pending',
    lastError: undefined,
  };

  items[idx] = updated;
  await writeAll(items);
  return hydrateOutboxItem(updated);
}

function isReachable(state: Awaited<ReturnType<typeof NetInfo.fetch>>): boolean {
  if (!state.isConnected) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

/**
 * Upload queued assessments to the FastAPI backend (then web dashboard via shared DB).
 */
export async function processOutbox(): Promise<void> {
  if (outboxRun) return outboxRun;

  outboxRun = processOutboxOnce().finally(() => {
    outboxRun = null;
  });
  return outboxRun;
}

async function processOutboxOnce(): Promise<void> {
  const net = await NetInfo.fetch();
  if (!isReachable(net)) return;
  if (!isApiUrlConfigured()) return;

  const token = await getUserToken();
  if (!token) return;

  // Items left in 'syncing' mean a previous attempt died mid-flight (crash, timeout, kill).
  // Reset them so they are retried this run.
  const all = await readAll();
  const stale = all.filter((i) => i.status === 'syncing');
  for (const item of stale) {
    await replaceItem({ ...item, status: 'failed', lastError: 'Previous upload interrupted — retrying.' });
  }

  const items = await readAll();
  const pending = items.filter((i) => i.status === 'pending' || i.status === 'failed');

  for (const item of pending) {
    if (item.input.latitude === 0 && item.input.longitude === 0) {
      await replaceItem({
        ...item,
        status: 'failed',
        lastError: 'GPS coordinates are missing (0,0). Open this assessment and tap Capture GPS now.',
      });
      continue;
    }

    const syncing: OutboxItem = {
      ...item,
      status: 'syncing',
      attempts: item.attempts + 1,
      lastError: undefined,
    };
    await replaceItem(syncing);

    try {
      // Send the verdict the phone reached when the assessment was captured, so the
      // portal shows exactly what the inspector saw -- online or offline.
      await submitAssessmentForMlSync(
        syncing.input,
        toDevicePredictionPayload(
          syncing.localPrediction,
          syncing.localActionPlan,
          syncing.localPriorityScore
        )
      );
      await removeOutbox(syncing.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await replaceItem({
        ...syncing,
        status: 'failed',
        lastError: message,
      });
    }
  }
}
