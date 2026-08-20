from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


# -- Enums --

class UserRole(str, Enum):
    ADMIN = "admin"
    ENGINEER = "engineer"
    DRRMO = "drrmo"
    INSPECTOR = "inspector"


class AssessmentPhase(str, Enum):
    PRE_EARTHQUAKE = "pre-earthquake"
    POST_EARTHQUAKE = "post-earthquake"


class AssessmentStatus(str, Enum):
    PENDING_SYNC = "pending-sync"
    PENDING_REVIEW = "pending-review"
    REVIEWED = "reviewed"
    REPORT_GENERATED = "report-generated"


class BuildingUse(str, Enum):
    RESIDENTIAL = "residential"
    COMMERCIAL = "commercial"
    INSTITUTIONAL = "institutional"
    INDUSTRIAL = "industrial"
    MIXED = "mixed"


class SoilClass(str, Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    E = "E"
    F = "F"


class ImageAngle(str, Enum):
    FRONT = "front"
    LEFT = "left"
    RIGHT = "right"
    CLOSEUP = "closeup"


# -- Auth --

class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=6, max_length=255)


class SignupRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=6, max_length=255)
    full_name: str = Field(..., min_length=1, max_length=255)
    role: UserRole = UserRole.INSPECTOR
    lgu_code: str = ""


class AuthenticatedUser(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    lgu_code: str
    verification_status: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: AuthenticatedUser


# -- Profile --

class ProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    full_name: str
    role: str
    lgu_code: str
    avatar_url: str | None = None
    verification_status: str
    created_at: datetime
    updated_at: datetime


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    role: UserRole | None = None
    lgu_code: str | None = None


class AdminDeleteUserBody(BaseModel):
    """Re-verify the signed-in admin's Supabase password before destructive delete."""

    password: str = Field(..., min_length=1, max_length=256)


# -- Building --

class BuildingCreate(BaseModel):
    building_code: str = Field(..., min_length=1, max_length=100)
    address: str = Field(..., min_length=1, max_length=500)
    barangay: str = Field(..., min_length=1, max_length=150)
    municipality: str = Field(..., min_length=1, max_length=150)
    longitude: float = 0
    latitude: float = 0
    building_use: BuildingUse = BuildingUse.RESIDENTIAL
    number_of_stories: int = Field(1, ge=1, le=200)
    year_built: int | None = None
    structural_system: str | None = None
    foundation_type: str | None = None
    soil_classification: SoilClass | None = None
    distance_to_fault_km: float | None = None
    previous_retrofit: bool = False


class BuildingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    building_code: str
    address: str
    barangay: str
    municipality: str
    longitude: float
    latitude: float
    building_use: str
    number_of_stories: int
    year_built: int | None = None
    structural_system: str | None = None
    foundation_type: str | None = None
    soil_classification: str | None = None
    distance_to_fault_km: float | None = None
    previous_retrofit: bool
    created_at: datetime
    updated_at: datetime


class BuildingUpdate(BaseModel):
    address: str | None = None
    barangay: str | None = None
    municipality: str | None = None
    longitude: float | None = None
    latitude: float | None = None
    building_use: BuildingUse | None = None
    number_of_stories: int | None = None
    year_built: int | None = None
    structural_system: str | None = None
    foundation_type: str | None = None
    soil_classification: SoilClass | None = None
    distance_to_fault_km: float | None = None
    previous_retrofit: bool | None = None


# -- Assessment --

class AssessmentImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    storage_path: str
    original_filename: str
    angle: str | None = None
    captured_at: datetime | None = None
    created_at: datetime


class AIResultRead(BaseModel):
    image_label: str | None = None
    image_confidence: float | None = None
    image_probabilities: dict[str, Any] | None = None
    tabular_label: str | None = None
    tabular_confidence: float | None = None
    feature_importance: dict[str, Any] | None = None
    fused_label: str | None = None
    fused_confidence: float | None = None
    fusion_weights: dict[str, float] | None = None


class AssessmentCreate(BaseModel):
    building_id: UUID
    phase: AssessmentPhase
    structural_data: dict[str, Any] = {}


PRE_LABELS = {"low", "moderate", "high"}
POST_LABELS = {"SAFE", "RESTRICTED", "UNSAFE"}


class DeviceActionPlan(BaseModel):
    """The FEMA/ATC-20 template plan the phone produced without a network."""

    recommendations: list[str] = Field(default_factory=list, max_length=40)
    generated_by: Literal["device-local"] = "device-local"


class DevicePrediction(BaseModel):
    """Classification computed on the phone.

    The device is the only thing that classifies: it runs the same fused model the
    server used to, but against geo features from its bundled sjdm_geo.json. The
    server therefore stores this verbatim instead of recomputing -- a second
    inference pass would read different elevation/slope/fault values and disagree
    with the result the inspector was shown in the field.
    """

    phase: Literal["pre", "post"]
    fused_label: str
    fused_confidence: float = Field(..., ge=0.0, le=1.0)
    probabilities: dict[str, float] = Field(default_factory=dict)

    image_label: str | None = None
    image_confidence: float | None = Field(None, ge=0.0, le=1.0)
    image_probabilities: dict[str, float] | None = None

    tabular_label: str | None = None
    tabular_confidence: float | None = Field(None, ge=0.0, le=1.0)
    tabular_probabilities: dict[str, float] | None = None

    fusion_weights: dict[str, float] | None = None

    # Distinguishes a real on-device fusion run from the heuristic that fires when
    # TFLite/ONNX fail to load. The UI must be able to tell these apart.
    source: Literal["device-ml-fusion", "device-offline-heuristic"]

    priority_score: float | None = Field(None, ge=0.0, le=1.0)
    action_plan: DeviceActionPlan | None = None

    @model_validator(mode="after")
    def _label_matches_phase(self) -> DevicePrediction:
        allowed = PRE_LABELS if self.phase == "pre" else POST_LABELS
        if self.fused_label not in allowed:
            raise ValueError(
                f"fused_label {self.fused_label!r} is not valid for phase "
                f"{self.phase!r}; expected one of {sorted(allowed)}"
            )
        return self


class AssessmentSyncPayload(BaseModel):
    building_code: str = Field(..., min_length=1, max_length=100)
    address: str = Field(..., min_length=1, max_length=500)
    barangay: str = Field(..., min_length=1, max_length=150)
    municipality: str = Field("", max_length=150)
    longitude: float = 0
    latitude: float = 0
    building_use: BuildingUse = BuildingUse.RESIDENTIAL
    number_of_stories: int = 1
    year_built: int | None = None
    phase: AssessmentPhase = AssessmentPhase.PRE_EARTHQUAKE
    structural_data: dict[str, Any] = {}

    # Optional so an older mobile build still syncs; when absent the record is
    # stored unclassified rather than being scored by a second, disagreeing engine.
    device_prediction: DevicePrediction | None = None


class AssessmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    building_id: UUID
    inspector_id: UUID
    phase: str
    structural_data: dict[str, Any]
    ai_fused_label: str | None = None
    ai_fused_confidence: float | None = None
    action_recommendations: list[str] | None = None
    override_classification: str | None = None
    review_justification: str | None = None
    reviewed_by: UUID | None = None
    reviewed_at: datetime | None = None
    priority_score: float
    status: str
    created_at: datetime
    updated_at: datetime
    images: list[AssessmentImageRead] = []


class AssessmentDetailRead(AssessmentRead):
    ai_image_label: str | None = None
    ai_image_confidence: float | None = None
    ai_image_probabilities: dict[str, Any] | None = None
    ai_tabular_label: str | None = None
    ai_tabular_confidence: float | None = None
    ai_feature_importance: dict[str, Any] | None = None
    ai_fusion_weights: dict[str, float] | None = None
    action_generated_by: str | None = None
    action_generated_at: datetime | None = None
    building: BuildingRead | None = None


class EngineerReviewPayload(BaseModel):
    override_classification: str | None = None
    justification: str = Field(..., min_length=1, max_length=2000)


# -- AI inference --

class AIPhase(str, Enum):
    PRE = "pre"
    POST = "post"


class TabularPredictPayload(BaseModel):
    """Structured building fields used by the RF model.

    ``elevation_m`` / ``slope_deg`` are optional — the server will auto-populate
    them from the SRTM tile using ``latitude`` / ``longitude`` when provided.
    """

    phase: AIPhase = AIPhase.PRE
    year_built: int | None = None
    number_of_stories: int = Field(1, ge=1, le=200)
    building_use: BuildingUse = BuildingUse.RESIDENTIAL
    soil_classification: SoilClass | None = None
    distance_to_fault_km: float | None = None
    elevation_m: float | None = None
    slope_deg: float | None = None
    previous_retrofit: bool = False
    structural_system: str | None = None
    foundation_type: str | None = None
    material: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class AIPredictionResult(BaseModel):
    phase: str
    label: str
    confidence: float
    probabilities: dict[str, float]
    weights: dict[str, float] | None = None
    image: dict[str, Any] | None = None
    tabular: dict[str, Any] | None = None
    feature_importance: dict[str, float] | None = None
