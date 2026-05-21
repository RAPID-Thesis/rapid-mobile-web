import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { supabase } from '../lib/supabase';
import { formatPercent } from '../lib/formatPercent';
import type { Assessment, AssessmentPhase, Building } from '../types';
import 'leaflet/dist/leaflet.css';

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
  const [barangayFilter, setBarangayFilter] = useState('');

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

  const barangays = useMemo(() => {
    const set = new Set(buildings.map((b) => b.barangay).filter(Boolean));
    return Array.from(set).sort();
  }, [buildings]);

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
  }, [assessments, buildings, phaseFilter, riskFilter, barangayFilter]);

  const center: [number, number] = useMemo(() => {
    if (markers.length === 0) return [14.8127, 121.0453];
    const lat = markers.reduce((s, m) => s + m!.position[0], 0) / markers.length;
    const lng = markers.reduce((s, m) => s + m!.position[1], 0) / markers.length;
    return [lat, lng];
  }, [markers]);

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
            value={barangayFilter}
            onChange={(e) => setBarangayFilter(e.target.value)}
            className="h-9 px-2 border border-slate-300 rounded-lg bg-white text-slate-700 max-w-[200px]"
          >
            <option value="">All barangays</option>
            {barangays.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
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
      </p>

      <div
        className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm"
        style={{ height: 'calc(100vh - 220px)' }}
      >
        {markers.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div className="text-center px-4">
              <p className="text-lg font-semibold mb-1">No points match your filters</p>
              <p className="text-sm">Adjust filters or complete assessments with AI labels and coordinates.</p>
            </div>
          </div>
        ) : (
          <MapContainer center={center} zoom={14} style={{ height: '100%', width: '100%' }} key={`${center[0]}-${center[1]}-${markers.length}`}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
        )}
      </div>
    </div>
  );
}
