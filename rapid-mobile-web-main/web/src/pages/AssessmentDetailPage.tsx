import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Assessment, Building } from '../types';

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
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [building, setBuilding] = useState<Building | null>(null);
  const [loading, setLoading] = useState(true);
  const [overrideClass, setOverrideClass] = useState('');
  const [justification, setJustification] = useState('');

  useEffect(() => {
    async function load() {
      if (!id) return;
      const { data: aData } = await supabase
        .from('assessments')
        .select('*, assessment_images(*)')
        .eq('id', id)
        .single();

      if (aData) {
        const a = { ...aData, images: aData.assessment_images ?? [] } as Assessment;
        setAssessment(a);
        const { data: bData } = await supabase
          .from('buildings')
          .select('*')
          .eq('id', a.building_id)
          .single();
        setBuilding(bData as Building | null);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500 text-lg mb-4">Assessment not found.</p>
        <button onClick={() => navigate('/assessments')} className="text-blue-600 hover:underline text-sm">
          Back to Assessments
        </button>
      </div>
    );
  }

  const classLabel = assessment.ai_fused_label ?? 'Pending';
  const cls = getClassColor(classLabel);

  return (
    <div>
      <button onClick={() => navigate(-1)} className="text-sm text-blue-600 hover:underline mb-4 inline-block">&larr; Back to list</button>

      <div className={`${cls.bg} rounded-xl p-6 text-white flex items-center justify-between mb-6 shadow-sm`}>
        <div>
          <p className="text-sm opacity-80">Fused Classification</p>
          <p className="text-3xl font-black">{classLabel.toUpperCase()}</p>
          {assessment.ai_fused_confidence != null && <p className="text-sm opacity-80">{(assessment.ai_fused_confidence * 100).toFixed(1)}% confidence</p>}
        </div>
        <div className="text-right">
          <p className="text-sm opacity-80">Priority Score</p>
          <p className="text-4xl font-black">{assessment.priority_score}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {building && (
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-4">Building Information</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">Code:</span> <span className="font-semibold">{building.building_code}</span></div>
                <div><span className="text-slate-500">Address:</span> <span className="font-semibold">{building.address}</span></div>
                <div><span className="text-slate-500">Barangay:</span> <span className="font-semibold">{building.barangay}</span></div>
                <div><span className="text-slate-500">Municipality:</span> <span className="font-semibold">{building.municipality}</span></div>
                <div><span className="text-slate-500">Use:</span> <span className="font-semibold capitalize">{building.building_use}</span></div>
                <div><span className="text-slate-500">Stories:</span> <span className="font-semibold">{building.number_of_stories}</span></div>
                <div><span className="text-slate-500">Year Built:</span> <span className="font-semibold">{building.year_built ?? '—'}</span></div>
                <div><span className="text-slate-500">Soil Class:</span> <span className="font-semibold">{building.soil_classification ?? '—'}</span></div>
                <div><span className="text-slate-500">Fault Distance:</span> <span className="font-semibold">{building.distance_to_fault_km != null ? `${building.distance_to_fault_km} km` : '—'}</span></div>
                <div><span className="text-slate-500">Previous Retrofit:</span> <span className="font-semibold">{building.previous_retrofit ? 'Yes' : 'No'}</span></div>
              </div>
            </div>
          )}

          {assessment.images.length > 0 && (
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-4">Photos ({assessment.images.length})</h3>
              <div className="flex gap-3 overflow-x-auto">
                {assessment.images.map((img) => (
                  <div key={img.id} className="shrink-0">
                    <div className="w-40 h-30 rounded-lg bg-slate-200 flex items-center justify-center text-xs text-slate-500">
                      {img.angle ?? 'Photo'}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 text-center capitalize">{img.angle ?? 'Photo'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(assessment.ai_image_probabilities != null || assessment.ai_feature_importance != null) && (
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-4">AI Classification Results</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {assessment.ai_image_probabilities && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-600 mb-2">Image Branch (ResNet50)</h4>
                    {Object.entries(assessment.ai_image_probabilities).map(([k, v]) => (
                      <ConfidenceBar key={k} label={k.toUpperCase()} value={v} color={getClassColor(k).bar} />
                    ))}
                  </div>
                )}
                {assessment.ai_feature_importance && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-600 mb-2">Tabular Branch (Feature Importance)</h4>
                    {Object.entries(assessment.ai_feature_importance).map(([k, v]) => (
                      <ConfidenceBar key={k} label={k} value={v} color="#3b82f6" />
                    ))}
                  </div>
                )}
              </div>
              {assessment.ai_fusion_weights && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <p className="text-xs text-slate-500 mb-2">
                    Fusion Weights: Image {(assessment.ai_fusion_weights.image * 100).toFixed(0)}% / Tabular {(assessment.ai_fusion_weights.tabular * 100).toFixed(0)}%
                  </p>
                </div>
              )}
            </div>
          )}

          {assessment.action_recommendations && assessment.action_recommendations.length > 0 && (
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800">Action Plan</h3>
                <span className="text-xs text-slate-500">
                  Generated by: {assessment.action_generated_by === 'gemini' ? 'Gemini AI' : 'Template Fallback'}
                </span>
              </div>
              <ol className="space-y-2">
                {assessment.action_recommendations.map((rec, i) => (
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

        <div className="space-y-6">
          <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-3">Status</h3>
            <p className="text-sm capitalize text-slate-600">{assessment.status.replace(/-/g, ' ')}</p>
            <p className="text-xs text-slate-400 mt-1">Phase: {assessment.phase === 'pre-earthquake' ? 'Pre-Earthquake' : 'Post-Earthquake'}</p>
            <p className="text-xs text-slate-400">Created: {new Date(assessment.created_at).toLocaleString()}</p>
          </div>

          <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-3">Engineer Review</h3>
            {assessment.reviewed_by ? (
              <div className="text-sm space-y-2">
                <p className="text-green-600 font-semibold">Reviewed</p>
                <p className="text-slate-500 text-xs">At: {assessment.reviewed_at ? new Date(assessment.reviewed_at).toLocaleString() : '—'}</p>
                {assessment.override_classification && (
                  <div className="bg-amber-50 rounded-lg p-3 mt-2">
                    <p className="text-xs text-amber-800 font-semibold">Classification Override</p>
                    <p className="font-bold text-amber-700">{assessment.override_classification}</p>
                    <p className="text-xs text-amber-600 mt-1">{assessment.review_justification}</p>
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

          <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
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
