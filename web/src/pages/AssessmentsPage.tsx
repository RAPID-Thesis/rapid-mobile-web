import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockAssessments } from '../mock/assessments';
import { mockBuildings } from '../mock/buildings';
import type { AssessmentPhase, AssessmentStatus } from '../types';

export default function AssessmentsPage() {
  const navigate = useNavigate();
  const [phaseFilter, setPhaseFilter] = useState<AssessmentPhase | ''>('');
  const [statusFilter, setStatusFilter] = useState<AssessmentStatus | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'date' | 'priority'>('date');

  const filtered = useMemo(() => {
    let result = [...mockAssessments];
    if (phaseFilter) result = result.filter(a => a.phase === phaseFilter);
    if (statusFilter) result = result.filter(a => a.status === statusFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a => {
        const building = mockBuildings.find(b => b._id === a.buildingId);
        return (
          building?.buildingCode.toLowerCase().includes(q) ||
          building?.address.toLowerCase().includes(q) ||
          building?.barangay.toLowerCase().includes(q)
        );
      });
    }
    result.sort((a, b) =>
      sortField === 'priority'
        ? b.priorityScore - a.priorityScore
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return result;
  }, [phaseFilter, statusFilter, searchQuery, sortField]);

  function getClassBadge(label: string) {
    const lower = label.toLowerCase();
    if (lower === 'unsafe' || lower === 'high') return 'bg-red-100 text-red-700';
    if (lower === 'restricted' || lower === 'moderate') return 'bg-amber-100 text-amber-700';
    return 'bg-green-100 text-green-700';
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'pending-sync': return 'bg-indigo-100 text-indigo-700';
      case 'pending-review': return 'bg-amber-100 text-amber-700';
      case 'reviewed': return 'bg-green-100 text-green-700';
      case 'report-generated': return 'bg-blue-100 text-blue-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Assessments</h2>
        <span className="text-sm text-slate-500">{filtered.length} of {mockAssessments.length} shown</span>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search building code, address..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="h-10 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
        <select
          value={phaseFilter}
          onChange={e => setPhaseFilter(e.target.value as AssessmentPhase | '')}
          className="h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="">All Phases</option>
          <option value="pre-earthquake">Pre-Earthquake</option>
          <option value="post-earthquake">Post-Earthquake</option>
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as AssessmentStatus | '')}
          className="h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="">All Statuses</option>
          <option value="pending-sync">Pending Sync</option>
          <option value="pending-review">Pending Review</option>
          <option value="reviewed">Reviewed</option>
          <option value="report-generated">Report Generated</option>
        </select>
        <select
          value={sortField}
          onChange={e => setSortField(e.target.value as 'date' | 'priority')}
          className="h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="date">Sort by Date</option>
          <option value="priority">Sort by Priority</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wider bg-slate-50">
              <th className="px-4 py-3">Building</th>
              <th className="px-4 py-3">Barangay</th>
              <th className="px-4 py-3">Phase</th>
              <th className="px-4 py-3">Classification</th>
              <th className="px-4 py-3">Confidence</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(a => {
              const building = mockBuildings.find(b => b._id === a.buildingId);
              const label = a.aiResult?.fusedClassification.label ?? 'N/A';
              const confidence = a.aiResult?.fusedClassification.confidence;

              return (
                <tr
                  key={a._id}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/assessments/${a._id}`)}
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-sm text-slate-800">{building?.buildingCode}</p>
                    <p className="text-xs text-slate-500 truncate max-w-[180px]">{building?.address}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{building?.barangay}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      a.phase === 'pre-earthquake' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'
                    }`}>
                      {a.phase === 'pre-earthquake' ? 'Pre-EQ' : 'Post-EQ'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${getClassBadge(label)}`}>
                      {label.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {confidence != null && (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${confidence * 100}%` }} />
                        </div>
                        <span className="text-xs font-mono text-slate-600">{(confidence * 100).toFixed(0)}%</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-mono text-sm font-bold ${
                      a.priorityScore >= 80 ? 'text-red-600' : a.priorityScore >= 50 ? 'text-amber-600' : 'text-green-600'
                    }`}>
                      {a.priorityScore}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${getStatusBadge(a.status)}`}>
                      {a.status.replace(/-/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-500">No assessments match your filters.</div>
        )}
      </div>
    </div>
  );
}
