import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { mockAssessments } from '../mock/assessments';
import { mockBuildings } from '../mock/buildings';
import 'leaflet/dist/leaflet.css';

function getMarkerColor(label: string): string {
  const lower = label.toLowerCase();
  if (lower === 'unsafe' || lower === 'high') return '#dc2626';
  if (lower === 'restricted' || lower === 'moderate') return '#f59e0b';
  return '#16a34a';
}

export default function HeatmapPage() {
  const center: [number, number] = [13.879, 120.921]; // Taal, Batangas

  const markers = mockAssessments
    .filter(a => a.aiResult)
    .map(a => {
      const building = mockBuildings.find(b => b._id === a.buildingId);
      if (!building) return null;
      return {
        id: a._id,
        position: [building.location.coordinates[1], building.location.coordinates[0]] as [number, number],
        label: a.aiResult!.fusedClassification.label,
        confidence: a.aiResult!.fusedClassification.confidence,
        buildingCode: building.buildingCode,
        address: building.address,
        barangay: building.barangay,
        phase: a.phase,
        priority: a.priorityScore,
      };
    })
    .filter(Boolean);

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
      </div>
    </div>
  );
}
