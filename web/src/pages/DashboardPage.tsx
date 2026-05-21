import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatPercent } from '../lib/formatPercent';
import type { Assessment, Building } from '../types';

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <div className={`bg-white rounded-xl p-6 border border-slate-200 border-l-4 shadow-sm ${color}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium">{label}</p>
          <p className="text-3xl font-black text-slate-800 mt-1">{value}</p>
        </div>
        <span className="text-3xl opacity-20">{icon}</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [aRes, bRes] = await Promise.all([
        supabase.from('assessments').select('*').order('created_at', { ascending: false }),
        supabase.from('buildings').select('*'),
      ]);
      setAssessments((aRes.data as Assessment[]) ?? []);
      setBuildings((bRes.data as Building[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const total = assessments.length;
  const pendingReview = assessments.filter(a => a.status === 'pending-review').length;
  const highRisk = assessments.filter(a => {
    const label = a.ai_fused_label;
    return label === 'high' || label === 'UNSAFE';
  }).length;
  const reviewed = assessments.filter(a => a.status === 'reviewed' || a.status === 'report-generated').length;
  const recent = assessments.slice(0, 5);

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
      <h2 className="text-2xl font-black text-slate-800">Dashboard</h2>
      <p className="text-sm text-slate-500 mb-6">Operational view for FEMA P-154 and ATC-20 inspections.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Assessments" value={total} color="border-blue-500" icon="📋" />
        <StatCard label="Pending Review" value={pendingReview} color="border-amber-500" icon="⏳" />
        <StatCard label="High Risk / Unsafe" value={highRisk} color="border-red-500" icon="⚠️" />
        <StatCard label="Reviewed" value={reviewed} color="border-green-500" icon="✓" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-200">
          <h3 className="font-bold text-slate-800">Recent Assessments</h3>
        </div>
        {recent.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p className="text-lg font-semibold mb-1">No assessments yet</p>
            <p className="text-sm">Assessments submitted from the mobile app will appear here.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3">Building</th>
                <th className="px-4 py-3">Phase</th>
                <th className="px-4 py-3">Classification</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recent.map(a => {
                const building = buildings.find(b => b.id === a.building_id);
                const label = a.ai_fused_label ?? 'Pending';
                return (
                  <tr
                    key={a.id}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/assessments/${a.id}`)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-sm text-slate-800">{building?.building_code ?? '—'}</p>
                      <p className="text-xs text-slate-500 truncate max-w-[200px]">{building?.address}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium">{a.phase === 'pre-earthquake' ? 'Pre-EQ' : 'Post-EQ'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${getClassBadge(label)}`}>
                        {label.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-bold text-slate-700">{formatPercent(a.priority_score, 0)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-600">{a.status.replace(/-/g, ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(a.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
