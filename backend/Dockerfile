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

# Optional: download server ML weights at build time when not in the upload context.
# Set ML_ARTIFACTS_URL on Railway to a zip containing rf_*.joblib and resnet50_*.keras.
# For private GitHub releases, also set GITHUB_TOKEN (read-only PAT with repo contents access).
ARG ML_ARTIFACTS_URL=""
ARG GITHUB_TOKEN=""
RUN set -e; \
    if [ -n "$ML_ARTIFACTS_URL" ]; then \
      apt-get update && apt-get install -y --no-install-recommends curl unzip && \
      if [ -n "$GITHUB_TOKEN" ]; then \
        curl -fsSL -L \
          -H "Authorization: token ${GITHUB_TOKEN}" \
          -H "Accept: application/octet-stream" \
          "$ML_ARTIFACTS_URL" -o /tmp/ml-artifacts.zip; \
      else \
        curl -fsSL -L "$ML_ARTIFACTS_URL" -o /tmp/ml-artifacts.zip; \
      fi && \
      unzip -o /tmp/ml-artifacts.zip -d /srv/ml/artifacts && \
      rm /tmp/ml-artifacts.zip && \
      rm -rf /var/lib/apt/lists/*; \
    fi; \
    for f in rf_pre.joblib rf_post.joblib resnet50_pre.keras resnet50_post.keras; do \
      if [ ! -f "/srv/ml/artifacts/$f" ]; then \
        echo "WARN: missing /srv/ml/artifacts/$f - API starts but ML sync will fail until models are present"; \
      fi; \
    done

WORKDIR /srv/backend
ENV PYTHONPATH=/srv/backend
ENV MODEL_DIR=/srv/ml/artifacts
ENV SRTM_DIR=/srv/ml/data/gis/srtm

RUN chmod +x /srv/backend/docker-entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/srv/backend/docker-entrypoint.sh"]
