#!/bin/sh
set -e

echo "RAPID API starting..."
python3 /srv/backend/scripts/download_ml_artifacts.py
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8080}"
