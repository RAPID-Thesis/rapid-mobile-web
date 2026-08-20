#!/bin/sh
set -e

# No model download step: inference is on-device, so there is nothing to fetch and
# no warm-up before the container can serve traffic.
echo "RAPID API starting (inference: on-device)..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8080}"
