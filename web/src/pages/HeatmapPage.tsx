import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { supabase } from '../lib/supabase';
import type { Assessment, Building } from '../types';
import 'leaflet/dist/leaflet.css';

function getMarkerColor(label: string): string {
  const lower = label.toLowerCase();
  if (lower === 'unsafe' || lower === 'high') return '#dc2626';
  if (lower === 'restricted' || lower === 'moderate') return '#f59e0b';
  return '#16a34a';
}

export default function HeatmapPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);

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

  const center: [number, number] = [13.879, 120.921];

  const markers = assessments
    .filter(a => a.ai_fused_label != null)
    .map(a => {
      const building = buildings.find(b => b.id === a.building_id);
      if (!building) return null;
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
    .filter(Boolean);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-slate-800">Damage Heatmap</h2>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500" /> SAFE / Low</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-amber-500" /> RESTRICTED / Moderate</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500" /> UNSAFE / High</div>
        </div>
      </div>

      <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: 'calc(100vh - 200px)' }}>
        {markers.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div className="text-center">
              <p className="text-lg font-semibold mb-1">No assessment data to display</p>
              <p className="text-sm">Assessed buildings will appear on the map once data is available.</p>
            </div>
          </div>
        ) : (
          <MapContainer center={center} zoom={15} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {markers.map(m => m && (
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
                      </span>
                      {' '}({(m.confidence * 100).toFixed(0)}%)
                    </p>
                    <p className="text-xs text-slate-500">Priority: {m.priority} &bull; {m.phase === 'pre-earthquake' ? 'Pre-EQ' : 'Post-EQ'}</p>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        )}
      </div>
    </div>
  );
}
