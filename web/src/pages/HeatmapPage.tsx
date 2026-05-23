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
import 'leaflet/dist/leaflet.css';

/** San Jose del Monte, Bulacan — default map focus (users can still pan/zoom out). */
const SJDM_CENTER: [number, number] = [14.8138, 121.0453];
const SJDM_DEFAULT_ZOOM = 12;
const MAP_MIN_ZOOM = 3;
const BARANGAY_FOCUS_ZOOM = 16;

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
    const districtFallback =
      districtFilter ?? getDistrictForBarangay(barangayFilter) ?? null;

    let cancelled = false;
    void fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
      { headers: { 'Accept-Language': 'en' } }
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

function getMarkerColor(label: string): string {
  const lower = label.toLowerCase();
  if (lower === 'unsafe' || lower === 'high') return '#dc2626';
  if (lower === 'restricted' || lower === 'moderate') return '#f59e0b';
  return '#16a34a';
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
    async function load() {
      const [aRes, bRes] = await Promise.all([
        supabase.from('assessments').select('*'),
        supabase.from('buildings').select('*'),
      ]);
      setAssessments((aRes.data as Assessment[]) ?? []);
      setBuildings((bRes.data as Building[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const markers = useMemo(() => {
    return assessments
      .filter((a) => a.ai_fused_label != null)
      .filter((a) => !phaseFilter || a.phase === phaseFilter)
      .filter((a) => {
        if (riskFilter === 'all') return true;
        return riskTier(a.ai_fused_label!) === riskFilter;
      })
      .map((a) => {
        const building = buildings.find((b) => b.id === a.building_id);
        if (!building) return null;
        if (building.latitude === 0 || building.longitude === 0) return null;
        if (districtBarangaySet && !districtBarangaySet.has(building.barangay)) return null;
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
          priority: a.priority_score,
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-2xl font-black text-slate-800">Damage heatmap</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value as AssessmentPhase | '')}
            className="h-9 px-2 border border-slate-300 rounded-lg bg-white text-slate-700"
          >
            <option value="">All phases</option>
            <option value="pre-earthquake">Pre-EQ</option>
            <option value="post-earthquake">Post-EQ</option>
          </select>
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value as typeof riskFilter)}
            className="h-9 px-2 border border-slate-300 rounded-lg bg-white text-slate-700"
          >
            <option value="all">All risk levels</option>
            <option value="low">SAFE / Low</option>
            <option value="moderate">RESTRICTED / Moderate</option>
            <option value="high">UNSAFE / High</option>
          </select>
          <select
            value={districtFilter}
            onChange={(e) => {
              const next = e.target.value as SjdmDistrict | '';
              setDistrictFilter(next);
              if (!next) {
                setBarangayFilter('');
              } else if (barangayFilter && !SJDM_DISTRICTS[next].includes(barangayFilter)) {
                setBarangayFilter('');
              }
            }}
            className="h-9 px-2 border border-slate-300 rounded-lg bg-white text-slate-700"
          >
            <option value="">All districts</option>
            {SJDM_DISTRICT_OPTIONS.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>
          <select
            value={barangayFilter}
            onChange={(e) => setBarangayFilter(e.target.value)}
            disabled={!districtFilter}
            className="h-9 px-2 border border-slate-300 rounded-lg bg-white text-slate-700 max-w-[240px] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <option value="">
              {districtFilter ? 'All barangays in district' : 'Select district first'}
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
          </select>
          <div className="flex items-center gap-3 border-l border-slate-300 pl-3 ml-1">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-500" /> Low
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-amber-500" /> Mod
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-500" /> High
            </div>
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-500 mb-2">
        Showing {markers.length} assessed building{markers.length !== 1 ? 's' : ''} on the map.
        {markers.length === 0 ? ' Map is centered on San Jose del Monte — adjust filters or zoom out to explore.' : ''}
      </p>

      <div
        className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm"
        style={{ height: 'calc(100vh - 220px)' }}
      >
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
          {markers.map(
            (m) =>
              m && (
                <CircleMarker
                  key={m.id}
                  center={m.position}
                  radius={m.priority > 80 ? 14 : m.priority > 50 ? 10 : 7}
                  pathOptions={{
                    fillColor: getMarkerColor(m.label),
                    fillOpacity: 0.8,
                    color: getMarkerColor(m.label),
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div className="text-sm">
                      <p className="font-bold">{m.buildingCode}</p>
                      <p className="text-slate-600">{m.address}</p>
                      <p className="text-slate-500">Brgy. {m.barangay}</p>
                      <p className="mt-1">
                        <span className="font-bold" style={{ color: getMarkerColor(m.label) }}>
                          {m.label.toUpperCase()}
                        </span>{' '}
                        ({formatPercent(m.confidence, 0)})
                      </p>
                      <p className="text-xs text-slate-500">
                        Priority: {m.priority} &bull; {m.phase === 'pre-earthquake' ? 'Pre-EQ' : 'Post-EQ'}
                      </p>
                      <button
                        type="button"
                        className="mt-2 text-xs text-blue-600 underline"
                        onClick={() => navigate(`/assessments/${m.id}`)}
                      >
                        Open assessment
                      </button>
                    </div>
                  </Popup>
                </CircleMarker>
              )
          )}
        </MapContainer>
      </div>
    </div>
  );
}
