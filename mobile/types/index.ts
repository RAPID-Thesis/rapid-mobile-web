export type UserRole = 'admin' | 'engineer' | 'drrmo' | 'inspector';
export type AssessmentPhase = 'pre-earthquake' | 'post-earthquake';
export type AssessmentStatus = 'pending-sync' | 'pending-review' | 'reviewed' | 'report-generated';
export type BuildingUse = 'residential' | 'commercial' | 'institutional' | 'industrial' | 'mixed';
export type SoilClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type ImageAngle = 'front' | 'left' | 'right' | 'closeup';
export type SyncStatus = 'queued' | 'syncing' | 'synced' | 'failed';
export type RiskLevel = 'low' | 'moderate' | 'high';
export type DamageClass = 'SAFE' | 'RESTRICTED' | 'UNSAFE';

export interface User {
  _id: string;
  email: string;
  fullName: string;
  role: UserRole;
  lguCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface Building {
  _id: string;
  buildingCode: string;
  address: string;
  barangay: string;
  municipality: string;
  location: GeoPoint;
  buildingUse: BuildingUse;
  numberOfStories: number;
  yearBuilt: number;
  structuralSystem: string;
  foundationType: string;
  soilClassification: SoilClass;
  distanceToFaultKm: number;
  previousRetrofit: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentImage {
  url: string;
  angle: ImageAngle;
  capturedAt: string;
}

export interface StructuralData {
  material: string;
  condition: string;
  irregularities: string[];
  occupancyAtTime: number;
}

export interface AIClassificationResult {
  label: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface AIResult {
  imageClassification: AIClassificationResult;
  tabularClassification: AIClassificationResult & { featureImportance: Record<string, number> };
  fusedClassification: { label: string; confidence: number };
  fusionWeights: { image: number; tabular: number };
}

export interface ActionPlan {
  recommendations: string[];
  generatedBy: 'gemini' | 'template-fallback';
  generatedAt: string;
}

export interface EngineerReview {
  reviewedBy: string | null;
  overrideClassification: string | null;
  justification: string | null;
  reviewedAt: string | null;
}

export interface Assessment {
  _id: string;
  buildingId: string;
  inspectorId: string;
  phase: AssessmentPhase;
  images: AssessmentImage[];
  structuralData: StructuralData;
  aiResult: AIResult | null;
  actionPlan: ActionPlan | null;
  engineerReview: EngineerReview;
  priorityScore: number;
  status: AssessmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SyncQueueItem {
  queueId: string;
  assessmentPayload: Partial<Assessment>;
  imageFiles: string[];
  attempts: number;
  lastAttemptAt: string | null;
  status: SyncStatus;
}
