import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import type { Assessment, Building } from '../types';

/**
 * Loads assessments + buildings, the pair that Dashboard, Assessments, Heatmap
 * and Reports all need.
 *
 * Extracted mainly to fix a correctness bug rather than to save lines: all four
 * pages discarded the Supabase `error` field and fell back to `?? []`, so a
 * failed query rendered as "no assessments". In a disaster-response tool an
 * empty list means "nothing is damaged", which is the worst possible way to
 * fail. Errors now surface and the caller must handle them.
 */
export interface AssessmentData {
  assessments: Assessment[];
  buildings: Building[];
  /** Building lookup by id — every consumer was doing an O(n) find per row. */
  buildingById: Map<string, Building>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useAssessmentData(): AssessmentData {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const [aRes, bRes] = await Promise.all([
        supabase.from('assessments').select('*').order('created_at', { ascending: false }),
        supabase.from('buildings').select('*'),
      ]);

      if (cancelled) return;

      const failure = aRes.error ?? bRes.error;
      if (failure) {
        setError(failure.message);
        setAssessments([]);
        setBuildings([]);
      } else {
        setAssessments((aRes.data as Assessment[]) ?? []);
        setBuildings((bRes.data as Building[]) ?? []);
      }
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const buildingById = useMemo(() => {
    const map = new Map<string, Building>();
    for (const b of buildings) map.set(b.id, b);
    return map;
  }, [buildings]);

  return { assessments, buildings, buildingById, loading, error, reload };
}

/* -- Shared derivations ---------------------------------------------------- */

/** True for the labels that mean "do not enter" in either framework. */
export function isUnsafe(label: string | null | undefined): boolean {
  return label === 'high' || label === 'UNSAFE';
}

/** True for the labels that mean "limited entry". */
export function isRestricted(label: string | null | undefined): boolean {
  return label === 'moderate' || label === 'RESTRICTED';
}

export interface TriageCounts {
  total: number;
  unsafe: number;
  restricted: number;
  awaitingReview: number;
  reviewed: number;
  unclassified: number;
}

export function triageCounts(assessments: Assessment[]): TriageCounts {
  return {
    total: assessments.length,
    unsafe: assessments.filter((a) => isUnsafe(a.ai_fused_label)).length,
    restricted: assessments.filter((a) => isRestricted(a.ai_fused_label)).length,
    awaitingReview: assessments.filter((a) => a.status === 'pending-review').length,
    reviewed: assessments.filter((a) => a.status === 'reviewed' || a.status === 'report-generated')
      .length,
    unclassified: assessments.filter((a) => !a.ai_fused_label).length,
  };
}
