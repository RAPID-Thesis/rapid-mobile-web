# RAPID FastAPI — Google Cloud Run
#
# Build from repository root (includes ml/artifacts for inference):
#   docker build -f backend/Dockerfile -t rapid-api .
#
# Run locally (use a real .env with secrets):
#   docker run --rm -p 8080:8080 --env-file backend/.env rapid-api
#
# Cloud Run injects PORT; keep --host 0.0.0.0.

FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY backend/requirements.txt /srv/requirements.txt
RUN pip install --no-cache-dir -r /srv/requirements.txt

COPY backend /srv/backend
COPY ml /srv/ml

WORKDIR /srv/backend
ENV PYTHONPATH=/srv/backend
ENV MODEL_DIR=/srv/ml/artifacts
ENV SRTM_DIR=/srv/ml/data/gis/srtm

EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
