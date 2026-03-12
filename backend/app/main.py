from __future__ import annotations

import contextlib
import os
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .models import Assessment, AssessmentImage, UPLOAD_DIR, get_db, init_db
from .schemas import AssessmentRead, AssessmentSyncPayload
from .services.ml_fusion_engine import process_assessment

MAX_IMAGES = 4


@contextlib.asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="RADAR Backend API",
    version="0.1.0",
    description="Offline-first sync API for post-earthquake structural assessments.",
    lifespan=lifespan,
)


async def save_upload_file(upload: UploadFile, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)

    with destination.open("wb") as buffer:
        while chunk := await upload.read(1024 * 1024):
            buffer.write(chunk)

    await upload.close()


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
):
    if len(images) > MAX_IMAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A maximum of {MAX_IMAGES} images is allowed per assessment.",
        )

    try:
        payload = AssessmentSyncPayload.model_validate_json(assessment)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.errors(),
        ) from exc

    saved_files: list[Path] = []

    try:
        db_assessment = Assessment(
            building_code=payload.building_code,
            address=payload.address,
            barangay=payload.barangay,
            building_use=payload.building_use,
            phase=payload.phase.value,
            structural_data=payload.structural_data.model_dump(exclude_none=True),
            status=payload.status.value,
        )
        db.add(db_assessment)
        db.flush()

        for upload in images:
            original_name = upload.filename or "image.bin"
            suffix = Path(original_name).suffix or ".bin"
            stored_name = f"{db_assessment.id}_{uuid.uuid4().hex}{suffix}"
            destination = UPLOAD_DIR / stored_name

            await save_upload_file(upload, destination)
            saved_files.append(destination)

            relative_path = os.path.relpath(destination, UPLOAD_DIR.parent).replace("\\", "/")
            db.add(
                AssessmentImage(
                    assessment_id=db_assessment.id,
                    file_path=relative_path,
                    original_filename=original_name,
                )
            )

        db.commit()
    except Exception:
        db.rollback()
        for file_path in saved_files:
            if file_path.exists():
                file_path.unlink()
        raise

    created_assessment = db.scalar(
        select(Assessment)
        .options(selectinload(Assessment.images))
        .where(Assessment.id == db_assessment.id)
    )

    if created_assessment is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Assessment was saved but could not be reloaded.",
        )

    background_tasks.add_task(process_assessment, created_assessment.id)
    return created_assessment


@app.get("/api/assessments", response_model=list[AssessmentRead])
def list_assessments(db: Session = Depends(get_db)):
    result = db.scalars(
        select(Assessment)
        .options(selectinload(Assessment.images))
        .order_by(Assessment.created_at.desc())
    )
    return result.all()
