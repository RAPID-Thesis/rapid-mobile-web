import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

import type { LocalPredictionResult } from './localPredict';
import { isApiUrlConfigured } from './api';
import { getUserToken } from './auth';
import { submitAssessmentForMlSync, type WizardAssessmentSyncInput } from './sync';

const STORAGE_KEY = 'rapid_assessment_outbox_v1';
let outboxRun: Promise<void> | null = null;

export interface OutboxItem {
  id: string;
  createdAt: string;
  input: WizardAssessmentSyncInput;
  localPrediction: LocalPredictionResult;
  status: 'pending' | 'syncing' | 'failed';
  attempts: number;
  lastError?: string;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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
  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
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

  const items = await readAll();
  const pending = items.filter((i) => i.status === 'pending' || i.status === 'failed');

  for (const item of pending) {
    if (item.input.latitude === 0 && item.input.longitude === 0) {
      await replaceItem({
        ...item,
        status: 'failed',
        lastError: 'GPS coordinates are missing (0,0). Re-capture location and resubmit.',
      });
      continue;
    }

    const syncing: OutboxItem = {
      ...item,
      status: 'syncing',
      attempts: item.attempts + 1,
    };
    await replaceItem(syncing);

    try {
      await submitAssessmentForMlSync(syncing.input);
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
