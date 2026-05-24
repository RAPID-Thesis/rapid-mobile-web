#!/usr/bin/env python3
"""Upload dist/ml-artifacts.zip to Supabase Storage (files must be under plan limit)."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = REPO_ROOT / "backend" / ".env"
ZIP_PATH = REPO_ROOT / "dist" / "ml-artifacts.zip"
BUCKET = "ml-artifacts"
OBJECT = "server-models.zip"
# Supabase free tier single-object limit is typically 50 MB.
MAX_BYTES = 48 * 1024 * 1024


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.is_file():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        env[key.strip()] = val.strip()
    return env


def request(method: str, url: str, headers: dict[str, str], data: bytes | None = None) -> tuple[int, str]:
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")


def ensure_bucket(base: str, key: str) -> None:
    url = f"{base}/storage/v1/bucket"
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json", "apikey": key}
    payload = json.dumps({"id": BUCKET, "name": BUCKET, "public": True}).encode("utf-8")
    status, body = request("POST", url, headers, payload)
    if status in (200, 201):
        return
    if status == 409 or "already exists" in body.lower():
        return
    raise RuntimeError(f"Failed to create bucket ({status}): {body}")


def upload_object(base: str, key: str, zip_bytes: bytes) -> str:
    url = f"{base}/storage/v1/object/{BUCKET}/{OBJECT}"
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/zip",
        "x-upsert": "true",
        "apikey": key,
    }
    status, body = request("POST", url, headers, zip_bytes)
    if status not in (200, 201):
        raise RuntimeError(f"Upload failed ({status}): {body}")
    return f"{base}/storage/v1/object/public/{BUCKET}/{OBJECT}"


def print_github_release_help(size_mb: float) -> None:
    zip_path = ZIP_PATH.resolve()
    print("", file=sys.stderr)
    print(f"Supabase Storage rejected the upload ({size_mb:.0f} MB exceeds the free-tier object limit).", file=sys.stderr)
    print("Host the zip on GitHub Releases instead (supports large assets):", file=sys.stderr)
    print("", file=sys.stderr)
    print("  1. Open https://github.com/RAPID-Thesis/rapid-mobile-web/releases/new", file=sys.stderr)
    print(f"  2. Tag: v1.0.0-ml  Title: ML server artifacts", file=sys.stderr)
    print(f"  3. Attach: {zip_path}", file=sys.stderr)
    print("  4. Publish, then copy the asset download URL and re-run deploy:", file=sys.stderr)
    print("", file=sys.stderr)
    print('     .\\scripts\\railway-deploy.ps1 -MlArtifactsUrl "https://github.com/.../ml-artifacts.zip"', file=sys.stderr)


def main() -> int:
    if not ZIP_PATH.is_file():
        print(f"Missing {ZIP_PATH}. Run: .\\scripts\\package-ml-artifacts.ps1", file=sys.stderr)
        return 1

    size = ZIP_PATH.stat().st_size
    size_mb = size / (1024 * 1024)
    if size > MAX_BYTES:
        print_github_release_help(size_mb)
        return 2

    env = load_env(ENV_FILE)
    base = env.get("SUPABASE_URL", "").rstrip("/")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not service_key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in backend/.env", file=sys.stderr)
        return 1

    print(f"Uploading {ZIP_PATH.name} ({size_mb:.1f} MB) to Supabase Storage...")
    ensure_bucket(base, service_key)
    public_url = upload_object(base, service_key, ZIP_PATH.read_bytes())
    print(public_url)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
