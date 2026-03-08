import { mockAssessments } from '../mock/assessments';
import { mockBuildings } from '../mock/buildings';

export default function ReportsPage() {
  const reportable = mockAssessments.filter(
    a => a.status === 'reviewed' || a.status === 'report-generated'
  );

  function getClassBadge(label: string) {
    const lower = label.toLowerCase();
    if (lower === 'unsafe' || lower === 'high') return 'bg-red-100 text-red-700';
    if (lower === 'restricted' || lower === 'moderate') return 'bg-amber-100 text-amber-700';
    return 'bg-green-100 text-green-700';
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Reports</h2>
        <span className="text-sm text-slate-500">{reportable.length} reports available</span>
      </div>

      <div className="bg-white rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wider bg-slate-50">
              <th className="px-4 py-3">Building</th>
              <th className="px-4 py-3">Phase</th>
              <th className="px-4 py-3">Classification</th>
              <th className="px-4 py-3">Reviewed By</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reportable.map(a => {
              const building = mockBuildings.find(b => b._id === a.buildingId);
              const label = a.engineerReview.overrideClassification ?? a.aiResult?.fusedClassification.label ?? 'N/A';
              const isGenerated = a.status === 'report-generated';

              return (
                <tr key={a._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-sm text-slate-800">{building?.buildingCode}</p>
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
                    {a.engineerReview.reviewedAt
                      ? new Date(a.engineerReview.reviewedAt).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(a.createdAt).toLocaleDateString()}
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
        {reportable.length === 0 && (
          <div className="text-center py-12 text-slate-500">No reviewed assessments available for reporting.</div>
        )}
      </div>
    </div>
  );
}
