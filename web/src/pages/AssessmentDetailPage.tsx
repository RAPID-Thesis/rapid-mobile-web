import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mockAssessments } from '../mock/assessments';
import { mockBuildings } from '../mock/buildings';

function ConfidenceBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3 mb-1">
      <span className="w-24 text-xs font-semibold text-slate-600">{label}</span>
      <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value * 100}%`, backgroundColor: color }} />
      </div>
      <span className="w-10 text-right text-xs font-bold text-slate-700">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

function getClassColor(label: string) {
  const lower = label.toLowerCase();
  if (lower === 'unsafe' || lower === 'high') return { bg: 'bg-red-500', text: 'text-red-700', light: 'bg-red-50', bar: '#dc2626' };
  if (lower === 'restricted' || lower === 'moderate') return { bg: 'bg-amber-500', text: 'text-amber-700', light: 'bg-amber-50', bar: '#f59e0b' };
  return { bg: 'bg-green-500', text: 'text-green-700', light: 'bg-green-50', bar: '#16a34a' };
}

export default function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const assessment = mockAssessments.find(a => a._id === id);
  const building = assessment ? mockBuildings.find(b => b._id === assessment.buildingId) : null;
  const [overrideClass, setOverrideClass] = useState('');
  const [justification, setJustification] = useState('');

  if (!assessment) {
    return <div className="text-center py-20 text-slate-500 text-lg">Assessment not found.</div>;
  }

  const fused = assessment.aiResult?.fusedClassification;
  const classLabel = fused?.label ?? 'N/A';
  const cls = getClassColor(classLabel);

  return (
    <div>
      <button onClick={() => navigate(-1)} className="text-sm text-blue-600 hover:underline mb-4 inline-block">&larr; Back to list</button>

      {/* Banner */}
      <div className={`${cls.bg} rounded-xl p-6 text-white flex items-center justify-between mb-6`}>
        <div>
          <p className="text-sm opacity-80">Fused Classification</p>
          <p className="text-3xl font-black">{classLabel.toUpperCase()}</p>
          {fused && <p className="text-sm opacity-80">{(fused.confidence * 100).toFixed(1)}% confidence</p>}
        </div>
        <div className="text-right">
          <p className="text-sm opacity-80">Priority Score</p>
          <p className="text-4xl font-black">{assessment.priorityScore}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Building Info */}
          <div className="bg-white rounded-xl p-6">
            <h3 className="font-bold text-slate-800 mb-4">Building Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">Code:</span> <span className="font-semibold">{building?.buildingCode}</span></div>
              <div><span className="text-slate-500">Address:</span> <span className="font-semibold">{building?.address}</span></div>
              <div><span className="text-slate-500">Barangay:</span> <span className="font-semibold">{building?.barangay}</span></div>
              <div><span className="text-slate-500">Municipality:</span> <span className="font-semibold">{building?.municipality}</span></div>
              <div><span className="text-slate-500">Use:</span> <span className="font-semibold capitalize">{building?.buildingUse}</span></div>
              <div><span className="text-slate-500">Stories:</span> <span className="font-semibold">{building?.numberOfStories}</span></div>
              <div><span className="text-slate-500">Year Built:</span> <span className="font-semibold">{building?.yearBuilt}</span></div>
              <div><span className="text-slate-500">Soil Class:</span> <span className="font-semibold">{building?.soilClassification}</span></div>
              <div><span className="text-slate-500">Fault Distance:</span> <span className="font-semibold">{building?.distanceToFaultKm} km</span></div>
              <div><span className="text-slate-500">Previous Retrofit:</span> <span className="font-semibold">{building?.previousRetrofit ? 'Yes' : 'No'}</span></div>
            </div>
          </div>

          {/* Photos */}
          <div className="bg-white rounded-xl p-6">
            <h3 className="font-bold text-slate-800 mb-4">Photos ({assessment.images.length})</h3>
            <div className="flex gap-3 overflow-x-auto">
              {assessment.images.map((img, i) => (
                <div key={i} className="shrink-0">
                  <img src={img.url} alt={img.angle} className="w-40 h-30 rounded-lg object-cover bg-slate-200" />
                  <p className="text-xs text-slate-500 mt-1 text-center capitalize">{img.angle}</p>
                </div>
              ))}
            </div>
          </div>

          {/* AI Results */}
          {assessment.aiResult && (
            <div className="bg-white rounded-xl p-6">
              <h3 className="font-bold text-slate-800 mb-4">AI Classification Results</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-semibold text-slate-600 mb-2">Image Branch (ResNet50)</h4>
                  {Object.entries(assessment.aiResult.imageClassification.probabilities).map(([k, v]) => (
                    <ConfidenceBar key={k} label={k.toUpperCase()} value={v as number} color={getClassColor(k).bar} />
                  ))}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-600 mb-2">Tabular Branch (Random Forest)</h4>
                  {Object.entries(assessment.aiResult.tabularClassification.probabilities).map(([k, v]) => (
                    <ConfidenceBar key={k} label={k.toUpperCase()} value={v as number} color={getClassColor(k).bar} />
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-200">
                <p className="text-xs text-slate-500 mb-2">
                  Fusion Weights: Image {(assessment.aiResult.fusionWeights.image * 100).toFixed(0)}% / Tabular {(assessment.aiResult.fusionWeights.tabular * 100).toFixed(0)}%
                </p>
              </div>
            </div>
          )}

          {/* Action Plan */}
          {assessment.actionPlan && (
            <div className="bg-white rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800">Action Plan</h3>
                <span className="text-xs text-slate-500">
                  Generated by: {assessment.actionPlan.generatedBy === 'gemini' ? 'Gemini AI' : 'Template Fallback'}
                </span>
              </div>
              <ol className="space-y-2">
                {assessment.actionPlan.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                    <span className="text-sm text-slate-700">{rec}</span>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-slate-400 mt-4 italic">
                These AI-generated recommendations require professional review by a licensed engineer.
              </p>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Status */}
          <div className="bg-white rounded-xl p-6">
            <h3 className="font-bold text-slate-800 mb-3">Status</h3>
            <p className="text-sm capitalize text-slate-600">{assessment.status.replace(/-/g, ' ')}</p>
            <p className="text-xs text-slate-400 mt-1">Phase: {assessment.phase === 'pre-earthquake' ? 'Pre-Earthquake' : 'Post-Earthquake'}</p>
            <p className="text-xs text-slate-400">Created: {new Date(assessment.createdAt).toLocaleString()}</p>
          </div>

          {/* Engineer Review */}
          <div className="bg-white rounded-xl p-6">
            <h3 className="font-bold text-slate-800 mb-3">Engineer Review</h3>
            {assessment.engineerReview.reviewedBy ? (
              <div className="text-sm space-y-2">
                <p className="text-green-600 font-semibold">Reviewed</p>
                <p className="text-slate-500 text-xs">At: {new Date(assessment.engineerReview.reviewedAt!).toLocaleString()}</p>
                {assessment.engineerReview.overrideClassification && (
                  <div className="bg-amber-50 rounded-lg p-3 mt-2">
                    <p className="text-xs text-amber-800 font-semibold">Classification Override</p>
                    <p className="font-bold text-amber-700">{assessment.engineerReview.overrideClassification}</p>
                    <p className="text-xs text-amber-600 mt-1">{assessment.engineerReview.justification}</p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p className="text-amber-600 text-sm font-semibold mb-4">Awaiting Review</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Override Classification</label>
                    <select
                      value={overrideClass}
                      onChange={e => setOverrideClass(e.target.value)}
                      className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">No override (approve AI result)</option>
                      <option value="SAFE">SAFE / Low</option>
                      <option value="RESTRICTED">RESTRICTED / Moderate</option>
                      <option value="UNSAFE">UNSAFE / High</option>
                    </select>
                  </div>
                  {overrideClass && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Justification *</label>
                      <textarea
                        value={justification}
                        onChange={e => setJustification(e.target.value)}
                        className="w-full h-20 px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none"
                        placeholder="Required when overriding..."
                      />
                    </div>
                  )}
                  <button className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors">
                    Submit Review
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Generate Report */}
          <div className="bg-white rounded-xl p-6">
            <h3 className="font-bold text-slate-800 mb-3">Report</h3>
            <button className="w-full h-10 border-2 border-blue-600 text-blue-600 hover:bg-blue-50 text-sm font-bold rounded-lg transition-colors">
              Generate PDF Report
            </button>
            <p className="text-xs text-slate-400 mt-2">FEMA P-154 format</p>
          </div>
        </div>
      </div>
    </div>
  );
}
