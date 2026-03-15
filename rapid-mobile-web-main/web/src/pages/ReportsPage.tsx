import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Assessment, Building } from '../types';

export default function ReportsPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [aRes, bRes] = await Promise.all([
        supabase
          .from('assessments')
          .select('*')
          .in('status', ['reviewed', 'report-generated'])
          .order('created_at', { ascending: false }),
        supabase.from('buildings').select('*'),
      ]);
      setAssessments((aRes.data as Assessment[]) ?? []);
      setBuildings((bRes.data as Building[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  function getClassBadge(label: string) {
    const lower = label.toLowerCase();
    if (lower === 'unsafe' || lower === 'high') return 'bg-red-100 text-red-700';
    if (lower === 'restricted' || lower === 'moderate') return 'bg-amber-100 text-amber-700';
    return 'bg-green-100 text-green-700';
  }

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
        <h2 className="text-2xl font-black text-slate-800">Reports</h2>
        <span className="text-sm text-slate-500">{assessments.length} reports available</span>
      </div>

      <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wider bg-slate-50">
              <th className="px-4 py-3">Building</th>
              <th className="px-4 py-3">Phase</th>
              <th className="px-4 py-3">Classification</th>
              <th className="px-4 py-3">Reviewed</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {assessments.map(a => {
              const building = buildings.find(b => b.id === a.building_id);
              const label = a.override_classification ?? a.ai_fused_label ?? 'N/A';
              const isGenerated = a.status === 'report-generated';

              return (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-sm text-slate-800">{building?.building_code ?? '—'}</p>
                    <p className="text-xs text-slate-500">{building?.address}</p>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {a.phase === 'pre-earthquake' ? 'Pre-EQ' : 'Post-EQ'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${getClassBadge(label)}`}>
                      {label.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {a.reviewed_at
                      ? new Date(a.reviewed_at).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(a.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {isGenerated ? (
                        <button className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors">
                          Download PDF
                        </button>
                      ) : (
                        <button className="px-3 py-1.5 border border-blue-600 text-blue-600 text-xs font-bold rounded-lg hover:bg-blue-50 transition-colors">
                          Generate PDF
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {assessments.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <p className="text-lg font-semibold mb-1">No reports available</p>
            <p className="text-sm">Reports will appear here once assessments have been reviewed by an engineer.</p>
          </div>
        )}
      </div>
    </div>
  );
}
