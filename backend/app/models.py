from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import (
    ARRAY,
    Boolean,
    DateTime,
    Double,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid,
    create_engine,
)
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")

UPLOAD_DIR = BASE_DIR / "uploads"
DATABASE_URL = os.getenv("DATABASE_URL", "")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL must be set in backend/.env")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# PostgreSQL native ENUMs (see supabase/migrations/001_initial_schema.sql). create_type=False: DB already has types.
_user_role = PG_ENUM(
    "admin", "engineer", "drrmo", "inspector", name="user_role", create_type=False
)
_building_use = PG_ENUM(
    "residential",
    "commercial",
    "institutional",
    "industrial",
    "mixed",
    name="building_use",
    create_type=False,
)
_soil_class = PG_ENUM("A", "B", "C", "D", "E", "F", name="soil_class", create_type=False)
_assessment_phase = PG_ENUM(
    "pre-earthquake", "post-earthquake", name="assessment_phase", create_type=False
)
_assessment_status = PG_ENUM(
    "pending-sync",
    "pending-review",
    "reviewed",
    "report-generated",
    name="assessment_status",
    create_type=False,
)
_action_plan_source = PG_ENUM(
    "gemini", "template-fallback", "device-local",
    name="action_plan_source", create_type=False,
)
_image_angle = PG_ENUM("front", "left", "right", "closeup", name="image_angle", create_type=False)


class Base(DeclarativeBase):
    pass


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(_user_role, nullable=False, default="inspector")
    lgu_code: Mapped[str] = mapped_column(Text, nullable=False, default="")
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Building(Base):
    __tablename__ = "buildings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    building_code: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    barangay: Mapped[str] = mapped_column(Text, nullable=False)
    municipality: Mapped[str] = mapped_column(Text, nullable=False)
    longitude: Mapped[float] = mapped_column(Double, nullable=False, default=0)
    latitude: Mapped[float] = mapped_column(Double, nullable=False, default=0)
    building_use: Mapped[str] = mapped_column(_building_use, nullable=False, default="residential")
    number_of_stories: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    year_built: Mapped[int | None] = mapped_column(Integer, nullable=True)
    structural_system: Mapped[str | None] = mapped_column(Text, nullable=True)
    foundation_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    soil_classification: Mapped[str | None] = mapped_column(_soil_class, nullable=True)
    distance_to_fault_km: Mapped[float | None] = mapped_column(Double, nullable=True)
    previous_retrofit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("profiles.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    assessments: Mapped[list["Assessment"]] = relationship(
        back_populates="building", cascade="all, delete-orphan", lazy="selectin"
    )


class Assessment(Base):
    __tablename__ = "assessments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    building_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("buildings.id", ondelete="CASCADE"), nullable=False
    )
    inspector_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("profiles.id"), nullable=False
    )
    phase: Mapped[str] = mapped_column(_assessment_phase, nullable=False)
    structural_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    ai_image_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_image_confidence: Mapped[float | None] = mapped_column(Double, nullable=True)
    ai_image_probabilities: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ai_tabular_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_tabular_confidence: Mapped[float | None] = mapped_column(Double, nullable=True)
    ai_feature_importance: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ai_fused_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_fused_confidence: Mapped[float | None] = mapped_column(Double, nullable=True)
    ai_fusion_weights: Mapped[dict | None] = mapped_column(JSONB, default={"image": 0.45, "tabular": 0.55})

    action_recommendations: Mapped[list | None] = mapped_column(ARRAY(Text), nullable=True)
    action_generated_by: Mapped[str | None] = mapped_column(_action_plan_source, nullable=True)
    action_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("profiles.id"), nullable=True
    )
    override_classification: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_justification: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    priority_score: Mapped[float] = mapped_column(Double, nullable=False, default=0)
    status: Mapped[str] = mapped_column(_assessment_status, nullable=False, default="pending-sync")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    building: Mapped["Building"] = relationship(back_populates="assessments")
    images: Mapped[list["AssessmentImage"]] = relationship(
        back_populates="assessment", cascade="all, delete-orphan", lazy="selectin"
    )


class AssessmentImage(Base):
    __tablename__ = "assessment_images"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assessment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False
    )
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    original_filename: Mapped[str] = mapped_column(Text, nullable=False)
    angle: Mapped[str | None] = mapped_column(_image_angle, nullable=True)
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    assessment: Mapped["Assessment"] = relationship(back_populates="images")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("profiles.id"), nullable=False
    )
    action: Mapped[str] = mapped_column(Text, nullable=False)
    table_name: Mapped[str] = mapped_column(Text, nullable=False)
    record_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    old_values: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_values: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
