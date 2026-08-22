import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from '../lib/supabase';
import { formatPercent } from '../lib/formatPercent';
import {
  SJDM_DISTRICTS,
  SJDM_DISTRICT_MAP_FOCUS,
  SJDM_DISTRICT_OPTIONS,
  getDistrictForBarangay,
  isWithinSjdm,
  type SjdmDistrict,
} from '../constants/sjdmLocations';
import type { Assessment, AssessmentPhase, Building } from '../types';
import {
  Button,
  Card,
  displayLabel,
  ErrorState,
  PageHeader,
  Select,
  severityBandLabel,
} from '../components/ui';
import 'leaflet/dist/leaflet.css';

/** San Jose del Monte, Bulacan — default map focus (users can still pan/zoom out). */
const SJDM_CENTER: [number, number] = [14.8138, 121.0453];
const SJDM_DEFAULT_ZOOM = 12;
const MAP_MIN_ZOOM = 3;
const BARANGAY_FOCUS_ZOOM = 16;

/**
 * Marker colours are the reserved safety palette, matching the badges in the
 * rest of the portal so a red dot on the map means exactly what a red badge in
 * the worklist means.
 */
const MARKER_COLOR = {
  high: '#b91c1c',
  moderate: '#b45309',
  low: '#15803d',
} as const;

/**
 * `priority_score` is written as a 0–1 fraction by the backend but some older
 * rows carry 0–100. Normalising here stops a legacy row from rendering as a
 * giant marker.
 */
function normalizedPriority(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value > 1 ? Math.min(value / 100, 1) : Math.max(value, 0);
}

function MapFocusController({
  districtFilter,
  barangayFilter,
  focusPoints,
}: {
  districtFilter: SjdmDistrict | '';
  barangayFilter: string;
  focusPoints: [number, number][];
}) {
  const map = useMap();

  useEffect(() => {
    if (!districtFilter && !barangayFilter) {
      map.flyTo(SJDM_CENTER, SJDM_DEFAULT_ZOOM, { duration: 0.6 });
      return;
    }

    if (districtFilter && !barangayFilter) {
      const focus = SJDM_DISTRICT_MAP_FOCUS[districtFilter];
      map.flyTo(focus.center, focus.zoom, { duration: 0.6 });
      return;
    }

    const validFocusPoints = focusPoints.filter(([lat, lng]) => isWithinSjdm(lat, lng));

    if (validFocusPoints.length === 1) {
      map.flyTo(validFocusPoints[0], BARANGAY_FOCUS_ZOOM, { duration: 0.6 });
      return;
    }

    if (validFocusPoints.length > 1) {
      map.flyToBounds(L.latLngBounds(validFocusPoints), {
        padding: [48, 48],
        maxZoom: BARANGAY_FOCUS_ZOOM,
        duration: 0.6,
      });
      return;
    }

    const query = `${barangayFilter}, San Jose del Monte, Bulacan, Philippines`;
    const districtFallback = districtFilter ?? getDistrictForBarangay(barangayFilter) ?? null;

    let cancelled = false;
    void fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
      { headers: { 'Accept-Language': 'en' } },
    )
      .then((res) => res.json())
      .then((results: { lat: string; lon: string }[]) => {
        if (cancelled) return;
        const hit = results?.[0];
        if (hit) {
          const lat = parseFloat(hit.lat);
          const lng = parseFloat(hit.lon);
          if (isWithinSjdm(lat, lng)) {
            map.flyTo([lat, lng], BARANGAY_FOCUS_ZOOM, { duration: 0.6 });
            return;
          }
        }
        if (districtFallback) {
          const focus = SJDM_DISTRICT_MAP_FOCUS[districtFallback];
          map.flyTo(focus.center, focus.zoom, { duration: 0.6 });
          return;
        }
        map.flyTo(SJDM_CENTER, SJDM_DEFAULT_ZOOM, { duration: 0.6 });
      })
      .catch(() => {
        if (cancelled) return;
        if (districtFallback) {
          const focus = SJDM_DISTRICT_MAP_FOCUS[districtFallback];
          map.flyTo(focus.center, focus.zoom, { duration: 0.6 });
          return;
        }
        map.flyTo(SJDM_CENTER, SJDM_DEFAULT_ZOOM, { duration: 0.6 });
      });

    return () => {
      cancelled = true;
    };
  }, [map, districtFilter, barangayFilter, focusPoints]);

  return null;
}

function riskTier(label: string): 'low' | 'moderate' | 'high' {
  const lower = label.toLowerCase();
  if (lower === 'unsafe' || lower === 'high') return 'high';
  if (lower === 'restricted' || lower === 'moderate') return 'moderate';
  return 'low';
}

export default function HeatmapPage() {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [phaseFilter, setPhaseFilter] = useState<AssessmentPhase | ''>('');
  const [riskFilter, setRiskFilter] = useState<'all' | 'low' | 'moderate' | 'high'>('all');
  const [districtFilter, setDistrictFilter] = useState<SjdmDistrict | ''>('');
  const [barangayFilter, setBarangayFilter] = useState('');

  const visibleDistricts = useMemo(() => {
    if (districtFilter) {
      return [[districtFilter, SJDM_DISTRICTS[districtFilter]]] as const;
    }
    return Object.entries(SJDM_DISTRICTS) as [SjdmDistrict, readonly string[]][];
  }, [districtFilter]);

  const districtBarangaySet = useMemo(() => {
    if (!districtFilter) return null;
    return new Set(SJDM_DISTRICTS[districtFilter]);
  }, [districtFilter]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const [aRes, bRes] = await Promise.all([
        supabase.from('assessments').select('*'),
        supabase.from('buildings').select('*'),
      ]);
      if (cancelled) return;

      const failure = aRes.error ?? bRes.error;
      if (failure) {
        setError(failure.message);
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

  const markers = useMemo(() => {
    return assessments
      .filter((a) => a.ai_fused_label != null)
      .filter((a) => !phaseFilter || a.phase === phaseFilter)
      .filter((a) => (riskFilter === 'all' ? true : riskTier(a.ai_fused_label!) === riskFilter))
      .map((a) => {
        const building = buildings.find((b) => b.id === a.building_id);
        if (!building) return null;
        if (building.latitude === 0 || building.longitude === 0) return null;
        if (districtBarangaySet && !(districtBarangaySet as Set<string>).has(building.barangay)) return null;
        if (barangayFilter && building.barangay !== barangayFilter) return null;
        return {
          id: a.id,
          position: [building.latitude, building.longitude] as [number, number],
          label: a.ai_fused_label!,
          confidence: a.ai_fused_confidence ?? 0,
          buildingCode: building.building_code,
          address: building.address,
          barangay: building.barangay,
          phase: a.phase,
          priority: normalizedPriority(a.priority_score),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }, [assessments, buildings, phaseFilter, riskFilter, districtBarangaySet, barangayFilter]);

  const mapFocusPoints = useMemo((): [number, number][] => {
    if (!barangayFilter) return [];
    return buildings
      .filter((b) => b.barangay === barangayFilter && b.latitude !== 0 && b.longitude !== 0)
      .map((b) => [b.latitude, b.longitude]);
  }, [buildings, barangayFilter]);

  const tally = useMemo(
    () => ({
      high: markers.filter((m) => riskTier(m.label) === 'high').length,
      moderate: markers.filter((m) => riskTier(m.label) === 'moderate').length,
      low: markers.filter((m) => riskTier(m.label) === 'low').length,
    }),
    [markers],
  );

  const hasFilters = Boolean(phaseFilter || riskFilter !== 'all' || districtFilter || barangayFilter);

  if (error) {
    return (
      <>
        <PageHeader title="Damage map" />
        <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Damage map"
        description={
          loading
            ? 'Loading…'
            : `${markers.length} assessed building${markers.length === 1 ? '' : 's'} plotted`
        }
      />

      <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
        {/* Filter panel — previously a row of unlabelled selects wrapping above
            the map; as a panel each control gets a visible label. */}
        <Card as="aside" className="h-fit">
          <div className="space-y-3 p-3">
            <div>
              <label htmlFor="hm-phase" className="mb-1 block text-2xs font-medium text-ink-muted">
                Phase
              </label>
              <Select
                id="hm-phase"
                value={phaseFilter}
                onChange={(e) => setPhaseFilter(e.target.value as AssessmentPhase | '')}
              >
                <option value="">All phases</option>
                <option value="pre-earthquake">Pre-earthquake</option>
                <option value="post-earthquake">Post-earthquake</option>
              </Select>
            </div>

            <div>
              <label htmlFor="hm-risk" className="mb-1 block text-2xs font-medium text-ink-muted">
                Classification
              </label>
              <Select
                id="hm-risk"
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value as typeof riskFilter)}
              >
                <option value="all">All classifications</option>
                <option value="high">{severityBandLabel('unsafe', phaseFilter)}</option>
                <option value="moderate">{severityBandLabel('restricted', phaseFilter)}</option>
                <option value="low">{severityBandLabel('safe', phaseFilter)}</option>
              </Select>
            </div>

            <div>
              <label htmlFor="hm-district" className="mb-1 block text-2xs font-medium text-ink-muted">
                District
              </label>
              <Select
                id="hm-district"
                value={districtFilter}
                onChange={(e) => {
                  const next = e.target.value as SjdmDistrict | '';
                  setDistrictFilter(next);
                  if (!next) {
                    setBarangayFilter('');
                  } else if (
                    barangayFilter &&
                    !(SJDM_DISTRICTS[next] as readonly string[]).includes(barangayFilter)
                  ) {
                    setBarangayFilter('');
                  }
                }}
              >
                <option value="">All districts</option>
                {SJDM_DISTRICT_OPTIONS.map((district) => (
                  <option key={district} value={district}>
                    {district}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label htmlFor="hm-brgy" className="mb-1 block text-2xs font-medium text-ink-muted">
                Barangay
              </label>
              <Select
                id="hm-brgy"
                value={barangayFilter}
                onChange={(e) => setBarangayFilter(e.target.value)}
                disabled={!districtFilter}
              >
                <option value="">
                  {districtFilter ? 'All barangays in district' : 'Select a district first'}
                </option>
                {visibleDistricts.map(([district, barangays]) => (
                  <optgroup key={district} label={district}>
                    {barangays.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </div>

            {hasFilters && (
              <Button
                size="sm"
                variant="ghost"
                fullWidth
                onClick={() => {
                  setPhaseFilter('');
                  setRiskFilter('all');
                  setDistrictFilter('');
                  setBarangayFilter('');
                }}
              >
                Reset filters
              </Button>
            )}

            {/* Legend doubles as a tally — the counts are the useful part. */}
            <div className="border-t border-line pt-3">
              <p className="mb-2 text-2xs font-medium uppercase tracking-wider text-ink-subtle">
                On the map
              </p>
              <ul className="space-y-1.5">
                {(
                  [
                    ['high', severityBandLabel('unsafe', phaseFilter), tally.high],
                    ['moderate', severityBandLabel('restricted', phaseFilter), tally.moderate],
                    ['low', severityBandLabel('safe', phaseFilter), tally.low],
                  ] as const
                ).map(([tier, label, count]) => (
                  <li key={tier} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: MARKER_COLOR[tier] }}
                      aria-hidden="true"
                    />
                    <span className="text-ink-muted">{label}</span>
                    <span className="tabular ml-auto font-medium text-ink">{count}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-2xs text-ink-subtle">Marker size reflects priority score.</p>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="h-[calc(100vh-220px)] min-h-[420px]">
            <MapContainer
              center={SJDM_CENTER}
              zoom={SJDM_DEFAULT_ZOOM}
              minZoom={MAP_MIN_ZOOM}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapFocusController
                districtFilter={districtFilter}
                barangayFilter={barangayFilter}
                focusPoints={mapFocusPoints}
              />
              {markers.map((m) => {
                const color = MARKER_COLOR[riskTier(m.label)];
                return (
                  <CircleMarker
                    key={m.id}
                    center={m.position}
                    radius={m.priority > 0.8 ? 13 : m.priority > 0.5 ? 10 : 7}
                    pathOptions={{ fillColor: color, fillOpacity: 0.75, color, weight: 2 }}
                  >
                    <Popup>
                      <div className="min-w-[180px]">
                        <p className="font-semibold text-ink">{m.buildingCode}</p>
                        <p className="text-xs text-ink-muted">{m.address}</p>
                        <p className="text-xs text-ink-subtle">Brgy. {m.barangay}</p>
                        <p className="mt-1.5 text-xs">
                          <span className="font-semibold uppercase" style={{ color }}>
                            {displayLabel(m.label, m.phase)}
                          </span>{' '}
                          <span className="text-ink-subtle">
                            · {formatPercent(m.confidence, 0)} confidence
                          </span>
                        </p>
                        <p className="text-2xs text-ink-subtle">
                          Priority {formatPercent(m.priority, 0)} ·{' '}
                          {m.phase === 'pre-earthquake' ? 'Pre-earthquake' : 'Post-earthquake'}
                        </p>
                        <button
                          type="button"
                          className="mt-2 text-xs font-medium text-brand-700 underline"
                          onClick={() => navigate(`/assessments/${m.id}`)}
                        >
                          Open assessment
                        </button>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
        </Card>
      </div>
    </>
  );
}
