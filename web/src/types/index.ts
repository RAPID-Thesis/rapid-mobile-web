export type UserRole = 'admin' | 'engineer' | 'drrmo' | 'inspector';
export type AssessmentPhase = 'pre-earthquake' | 'post-earthquake';
export type AssessmentStatus = 'pending-sync' | 'pending-review' | 'reviewed' | 'report-generated';
export type BuildingUse = 'residential' | 'commercial' | 'institutional' | 'industrial' | 'mixed';
export type SoilClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type ImageAngle = 'front' | 'left' | 'right' | 'closeup';
export type SyncStatus = 'queued' | 'syncing' | 'synced' | 'failed';
export type RiskLevel = 'low' | 'moderate' | 'high';
export type DamageClass = 'SAFE' | 'RESTRICTED' | 'UNSAFE';

export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  lgu_code: string;
  avatar_url: string | null;
  verification_status?: VerificationStatus | null;
  created_at: string;
  updated_at: string;
}

export interface Building {
  id: string;
  building_code: string;
  address: string;
  barangay: string;
  municipality: string;
  longitude: number;
  latitude: number;
  building_use: BuildingUse;
  number_of_stories: number;
  year_built: number | null;
  structural_system: string | null;
  foundation_type: string | null;
  soil_classification: SoilClass | null;
  distance_to_fault_km: number | null;
  previous_retrofit: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssessmentImage {
  id: string;
  storage_path: string;
  original_filename: string;
  angle: ImageAngle | null;
  captured_at: string | null;
  created_at: string;
}

export interface Assessment {
  id: string;
  building_id: string;
  inspector_id: string;
  phase: AssessmentPhase;
  structural_data: Record<string, unknown>;
  ai_fused_label: string | null;
  ai_fused_confidence: number | null;
  ai_image_label: string | null;
  ai_image_confidence: number | null;
  ai_image_probabilities: Record<string, number> | null;
  ai_tabular_label: string | null;
  ai_tabular_confidence: number | null;
  ai_tabular_probabilities: Record<string, number> | null;
  ai_feature_importance: Record<string, number> | null;
  ai_fusion_weights: { image: number; tabular: number } | null;
  action_recommendations: string[] | null;
  action_generated_by: 'gemini' | 'template-fallback' | null;
  action_generated_at: string | null;
  reviewed_by: string | null;
  override_classification: string | null;
  review_justification: string | null;
  reviewed_at: string | null;
  priority_score: number;
  status: AssessmentStatus;
  created_at: string;
  updated_at: string;
  images: AssessmentImage[];
  building?: Building;
}

export interface SyncQueueItem {
  queueId: string;
  assessmentPayload: Partial<Assessment>;
  imageFiles: string[];
  attempts: number;
  lastAttemptAt: string | null;
  status: SyncStatus;
}
