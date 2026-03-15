from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AssessmentPhase(str, Enum):
    PRE_EARTHQUAKE = "Pre-Earthquake"
    POST_EARTHQUAKE = "Post-Earthquake"


class AssessmentStatus(str, Enum):
    PENDING_ML_REVIEW = "pending_ml_review"
    COMPLETED = "completed"


class StructuralData(BaseModel):
    primary_material: str | None = None
    structural_system: str | None = None
    soil_class: str | None = None
    topography: str | None = None
    irregularity_vertical: str | None = None
    irregularity_plan: str | None = None
    hazard_pounding: str | None = None
    hazard_falling: str | None = None


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=255)


class AuthenticatedUser(BaseModel):
    username: str
    full_name: str
    role: str
    lgu_code: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: AuthenticatedUser


class AssessmentSyncPayload(BaseModel):
    building_code: str = Field(..., min_length=1, max_length=100)
    address: str = Field(..., min_length=1, max_length=255)
    barangay: str = Field(..., min_length=1, max_length=150)
    building_use: str = Field(..., min_length=1, max_length=100)
    phase: AssessmentPhase
    structural_data: StructuralData
    status: AssessmentStatus = AssessmentStatus.PENDING_ML_REVIEW


class AssessmentImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    file_path: str
    original_filename: str
    created_at: datetime


class AssessmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    building_code: str
    address: str
    barangay: str
    building_use: str
    phase: str
    structural_data: dict[str, Any]
    status: str
    created_at: datetime
    synced_at: datetime
    images: list[AssessmentImageRead] = []
