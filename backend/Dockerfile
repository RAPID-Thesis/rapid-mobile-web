# RAPID FastAPI — Railway / Cloud Run
#
# The API does NOT run inference. Classification happens on the phone with the
# models bundled in mobile/assets/models/; the server stores that verdict. So this
# image carries no TensorFlow, no model weights, and no SRTM tiles — it went from
# ~2.5 GB to roughly a tenth of that, and starts cold in seconds instead of minutes.
#
# Build from the repository root (see .dockerignore, which keeps ml/data out):
#   docker build -f backend/Dockerfile -t rapid-api .
#
# Run locally with real secrets:
#   docker run --rm -p 8080:8080 --env-file backend/.env rapid-api
#
# Railway and Cloud Run both inject PORT; keep --host 0.0.0.0.

FROM python:3.12-slim-bookworm

WORKDIR /srv

COPY backend/requirements.txt /srv/requirements.txt
RUN pip install --no-cache-dir -r /srv/requirements.txt

COPY backend /srv/backend

WORKDIR /srv/backend
ENV PYTHONPATH=/srv/backend
ENV PYTHONUNBUFFERED=1

RUN chmod +x /srv/backend/docker-entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/srv/backend/docker-entrypoint.sh"]
