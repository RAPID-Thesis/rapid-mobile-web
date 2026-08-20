from __future__ import annotations

import logging
import os
import traceback
import uuid
from datetime import datetime, timezone

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .models import Assessment, AssessmentImage, Building, Profile, get_db
from .schemas import (
    AdminDeleteUserBody,
    AssessmentCreate,
    AssessmentDetailRead,
    AssessmentRead,
    AssessmentSyncPayload,
    AuthenticatedUser,
    BuildingCreate,
    BuildingRead,
    BuildingUpdate,
    EngineerReviewPayload,
    LoginRequest,
    ProfileRead,
    ProfileUpdate,
    SignupRequest,
    TokenResponse,
)
from .security import get_current_user, require_roles
# The API no longer runs inference: the phone classifies with its bundled models and
# the server stores that verdict. Nothing here may import ml_fusion_engine, or the
# container would need TensorFlow again.
from .services.action_plan_task import enrich_action_plan
from .services.device_prediction import apply_device_prediction
from .supabase_client import get_supabase_admin, get_supabase_public

MAX_IMAGES = 8

logger = logging.getLogger(__name__)

app = FastAPI(
    title="RAPID Backend API",
    version="0.2.0",
    description="Supabase-powered API for the RAPID seismic assessment platform.",
)

default_cors_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:19006",
    "http://127.0.0.1:19006",
]

cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", ",".join(default_cors_origins)).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# AUTH
# =============================================================================

@app.post("/api/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: SignupRequest):
    supabase = get_supabase_admin()
    try:
        result = supabase.auth.sign_up(
            {
                "email": body.email,
                "password": body.password,
                "options": {
                    "data": {
                        "full_name": body.full_name,
                        "role": body.role.value,
                        "lgu_code": body.lgu_code,
                    }
                },
            }
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if result.user is None:
        raise HTTPException(status_code=400, detail="Registration failed.")

    session = result.session
    if session is None:
        raise HTTPException(
            status_code=201,
            detail="Account created. Check email for confirmation if email confirmation is enabled.",
        )

    profile_resp = (
        supabase.table("profiles")
        .select("*")
        .eq("id", str(result.user.id))
        .single()
        .execute()
    )
    profile = profile_resp.data or {}

    return TokenResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        expires_in=session.expires_in or 3600,
        user=AuthenticatedUser(
            id=result.user.id,
            email=result.user.email or body.email,
            full_name=profile.get("full_name", body.full_name),
            role=profile.get("role", body.role.value),
            lgu_code=profile.get("lgu_code", body.lgu_code),
            verification_status=profile.get("verification_status", "pending"),
        ),
    )


@app.post("/api/auth/login", response_model=TokenResponse)
def login(body: LoginRequest):
    supabase = get_supabase_admin()
    try:
        result = supabase.auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if result.user is None or result.session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    profile_resp = (
        supabase.table("profiles")
        .select("*")
        .eq("id", str(result.user.id))
        .single()
        .execute()
    )
    profile = profile_resp.data or {}
    if profile.get("verification_status") != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is still pending admin approval.",
        )

    return TokenResponse(
        access_token=result.session.access_token,
        refresh_token=result.session.refresh_token,
        expires_in=result.session.expires_in or 3600,
        user=AuthenticatedUser(
            id=result.user.id,
            email=result.user.email or body.email,
            full_name=profile.get("full_name", ""),
            role=profile.get("role", "inspector"),
            lgu_code=profile.get("lgu_code", ""),
            verification_status=profile.get("verification_status", "pending"),
        ),
    )


@app.get("/api/auth/me", response_model=ProfileRead)
def get_me(
    user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.get(Profile, user.id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found.")
    return profile


# =============================================================================
# PROFILES / USERS
# =============================================================================

@app.get("/api/users", response_model=list[ProfileRead])
def list_users(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "engineer", "drrmo")),
):
    return db.scalars(select(Profile).order_by(Profile.created_at.desc())).all()


@app.put("/api/users/{user_id}", response_model=ProfileRead)
def update_user(
    user_id: uuid.UUID,
    body: ProfileUpdate,
    db: Session = Depends(get_db),
    current: AuthenticatedUser = Depends(require_roles("admin")),
):
    profile = db.get(Profile, user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="User not found.")

    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            val = value.value if hasattr(value, "value") else value
            setattr(profile, field, val)

    profile.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(profile)
    return profile


@app.post("/api/users/{user_id}/delete", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_account(
    user_id: uuid.UUID,
    body: AdminDeleteUserBody,
    db: Session = Depends(get_db),
    current: AuthenticatedUser = Depends(require_roles("admin")),
):
    """Permanently remove a Supabase auth user (and cascaded profile). Requires admin password."""
    if user_id == current.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account.")

    target_profile = db.get(Profile, user_id)
    if target_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if target_profile.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts cannot be deleted through this action.",
        )

    public = get_supabase_public()
    try:
        sign_in = public.auth.sign_in_with_password(
            {"email": current.email, "password": body.password},
        )
    except Exception as exc:
        logger.warning("delete_user_account: password check failed for admin %s: %s", current.id, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password.",
        ) from exc

    if sign_in.user is None or str(sign_in.user.id) != str(current.id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password.")

    admin = get_supabase_admin()
    try:
        admin.auth.admin.delete_user(str(user_id), should_soft_delete=False)
    except Exception as exc:
        err = str(exc).lower()
        logger.exception("delete_user_account: Supabase delete_user failed for %s", user_id)
        if "foreign key" in err or "violates foreign key" in err or "23503" in err:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This user cannot be deleted while related records still exist (for example assessments they created). Remove or archive that data first.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not delete user account. Check server logs.",
        ) from exc

    return None


# =============================================================================
# BUILDINGS
# =============================================================================

@app.post("/api/buildings", response_model=BuildingRead, status_code=status.HTTP_201_CREATED)
def create_building(
    body: BuildingCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    building = Building(
        **body.model_dump(exclude={"building_use", "soil_classification"}),
        building_use=body.building_use.value,
        soil_classification=body.soil_classification.value if body.soil_classification else None,
        created_by=user.id,
    )
    db.add(building)
    db.commit()
    db.refresh(building)
    return building


@app.get("/api/buildings", response_model=list[BuildingRead])
def list_buildings(
    barangay: str | None = Query(None),
    municipality: str | None = Query(None),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(get_current_user),
):
    query = select(Building)
    if barangay:
        query = query.where(Building.barangay == barangay)
    if municipality:
        query = query.where(Building.municipality == municipality)
    query = query.order_by(Building.created_at.desc())
    return db.scalars(query).all()


@app.get("/api/buildings/{building_id}", response_model=BuildingRead)
def get_building(
    building_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(get_current_user),
):
    building = db.get(Building, building_id)
    if building is None:
        raise HTTPException(status_code=404, detail="Building not found.")
    return building


@app.put("/api/buildings/{building_id}", response_model=BuildingRead)
def update_building(
    building_id: uuid.UUID,
    body: BuildingUpdate,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(require_roles("admin", "engineer")),
):
    building = db.get(Building, building_id)
    if building is None:
        raise HTTPException(status_code=404, detail="Building not found.")

    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            val = value.value if hasattr(value, "value") else value
            setattr(building, field, val)

    building.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(building)
    return building


@app.get("/api/buildings/geojson")
def buildings_geojson(
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(get_current_user),
):
    buildings = db.scalars(select(Building)).all()
    features = []
    for b in buildings:
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [b.longitude, b.latitude],
                },
                "properties": {
                    "id": str(b.id),
                    "buildingCode": b.building_code,
                    "address": b.address,
                    "barangay": b.barangay,
                    "municipality": b.municipality,
                    "buildingUse": b.building_use,
                    "numberOfStories": b.number_of_stories,
                    "yearBuilt": b.year_built,
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


# =============================================================================
# ASSESSMENTS
# =============================================================================

@app.post("/api/assessments", response_model=AssessmentRead, status_code=status.HTTP_201_CREATED)
def create_assessment(
    body: AssessmentCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    building = db.get(Building, body.building_id)
    if building is None:
        raise HTTPException(status_code=404, detail="Building not found.")

    assessment = Assessment(
        building_id=body.building_id,
        inspector_id=user.id,
        phase=body.phase.value,
        structural_data=body.structural_data,
        status="pending-review",
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)

    # Records created here stay unclassified: classification happens on the phone,
    # which submits through POST /api/assessments/sync with its device_prediction.
    # There is no server-side model to fall back on.
    return assessment


@app.post(
    "/api/assessments/sync",
    response_model=AssessmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def sync_assessment(
    background_tasks: BackgroundTasks,
    assessment: str = Form(..., description="JSON-encoded assessment payload."),
    images: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(get_current_user),
):
    if len(images) > MAX_IMAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A maximum of {MAX_IMAGES} images is allowed per assessment.",
        )

    try:
        try:
            payload = AssessmentSyncPayload.model_validate_json(assessment)
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors()) from exc

        existing_building = db.scalar(
            select(Building).where(Building.building_code == payload.building_code)
        )

        if existing_building:
            building = existing_building
        else:
            building = Building(
                building_code=payload.building_code,
                address=payload.address,
                barangay=payload.barangay,
                municipality=payload.municipality,
                longitude=payload.longitude,
                latitude=payload.latitude,
                building_use=payload.building_use.value,
                number_of_stories=payload.number_of_stories,
                year_built=payload.year_built,
                created_by=user.id,
            )
            db.add(building)
            db.flush()

        db_assessment = Assessment(
            building_id=building.id,
            inspector_id=user.id,
            phase=payload.phase.value,
            structural_data=payload.structural_data,
            status="pending-review",
        )
        db.add(db_assessment)
        db.flush()

        supabase = get_supabase_admin()
        for upload in images:
            original_name = upload.filename or "image.bin"
            ext = original_name.rsplit(".", 1)[-1] if "." in original_name else "bin"
            storage_name = f"{db_assessment.id}/{uuid.uuid4().hex}.{ext}"

            file_bytes = await upload.read()
            supabase.storage.from_("assessment-images").upload(
                storage_name,
                file_bytes,
                {
                    "content-type": upload.content_type or "image/jpeg",
                    "upsert": "true",
                },
            )

            db.add(
                AssessmentImage(
                    assessment_id=db_assessment.id,
                    storage_path=storage_name,
                    original_filename=original_name,
                )
            )

        # The phone already classified this in the field, using its bundled models.
        # Store that verdict verbatim: re-running inference here would read different
        # geo features (server SRTM/shapefile vs the device's sjdm_geo.json) and
        # silently replace the result the inspector was shown.
        if payload.device_prediction is not None:
            apply_device_prediction(db_assessment, payload.device_prediction)

        db.commit()

        created = db.scalar(
            select(Assessment)
            .options(selectinload(Assessment.images))
            .where(Assessment.id == db_assessment.id)
        )
        if created is None:
            raise HTTPException(status_code=500, detail="Assessment saved but could not be reloaded.")

        # Online-only enrichment: upgrade the device's template action plan to a
        # Gemini-authored one. It never touches the classification.
        if payload.device_prediction is not None:
            background_tasks.add_task(enrich_action_plan, created.id)

        return created
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("sync_assessment failed")
        detail = f"{type(exc).__name__}: {exc}"
        if os.getenv("EXPOSE_SYNC_TRACEBACK", "").lower() in ("1", "true", "yes"):
            detail = f"{detail}\n{traceback.format_exc()}"
        raise HTTPException(status_code=500, detail=detail[:4000]) from exc


@app.get("/api/assessments", response_model=list[AssessmentRead])
def list_assessments(
    phase: str | None = Query(None),
    assessment_status: str | None = Query(None, alias="status"),
    barangay: str | None = Query(None),
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(get_current_user),
):
    query = select(Assessment).options(selectinload(Assessment.images))
    if phase:
        query = query.where(Assessment.phase == phase)
    if assessment_status:
        query = query.where(Assessment.status == assessment_status)
    if barangay:
        query = query.join(Building).where(Building.barangay == barangay)
    query = query.order_by(Assessment.created_at.desc())
    return db.scalars(query).all()


@app.get("/api/assessments/{assessment_id}", response_model=AssessmentDetailRead)
def get_assessment(
    assessment_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: AuthenticatedUser = Depends(get_current_user),
):
    result = db.scalar(
        select(Assessment)
        .options(selectinload(Assessment.images), selectinload(Assessment.building))
        .where(Assessment.id == assessment_id)
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found.")
    return result


@app.put("/api/assessments/{assessment_id}/review", response_model=AssessmentRead)
def review_assessment(
    assessment_id: uuid.UUID,
    body: EngineerReviewPayload,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_roles("admin", "engineer")),
):
    assessment = db.get(Assessment, assessment_id)
    if assessment is None:
        raise HTTPException(status_code=404, detail="Assessment not found.")

    assessment.reviewed_by = user.id
    assessment.override_classification = body.override_classification
    assessment.review_justification = body.justification
    assessment.reviewed_at = datetime.now(timezone.utc)
    assessment.status = "reviewed"
    assessment.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(assessment)
    return assessment


@app.get("/")
def root():
    """Avoid 404 when opening the server base URL in a browser."""
    return {
        "service": "RAPID Backend API",
        "version": "0.2.0",
        "docs": "/docs",
        "openapi": "/openapi.json",
        "health": "/api/health",
    }


@app.get("/api/health")
def health():
    # Inference runs on the device, so there are no server model artifacts to check
    # and nothing to warm up -- this answers immediately on a cold container.
    return {
        "status": "ok",
        "version": "0.3.0",
        "inference": "on-device",
    }
