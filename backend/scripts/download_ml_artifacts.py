#!/usr/bin/env python3
"""Download server ML artifacts from a GitHub Release at container startup."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

MODEL_DIR = Path(os.getenv("MODEL_DIR", "/srv/ml/artifacts"))
REQUIRED = ("rf_pre.joblib", "rf_post.joblib", "resnet50_pre.keras", "resnet50_post.keras")
RELEASE_TAG = os.getenv("ML_RELEASE_TAG", "v0.1.1-ml")
GITHUB_REPO = os.getenv("GITHUB_REPO", "RAPID-Thesis/rapid-mobile-web")
ASSET_NAME = os.getenv("ML_ASSET_NAME", "ml-artifacts.zip")


def _request(url: str, token: str, accept: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"token {token}",
            "Accept": accept,
            "User-Agent": "rapid-api",
        },
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        return resp.read()


def main() -> int:
    if all((MODEL_DIR / name).is_file() for name in REQUIRED):
        print("ML artifacts already present.")
        return 0

    token = os.getenv("GITHUB_TOKEN", "").strip()
    direct_url = os.getenv("ML_ARTIFACTS_URL", "").strip()
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Downloading ML artifacts into {MODEL_DIR}...")
    try:
        if token:
            release_url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/tags/{RELEASE_TAG}"
            release = json.loads(_request(release_url, token, "application/vnd.github+json"))
            assets = release.get("assets") or []
            asset = next((a for a in assets if a.get("name") == ASSET_NAME), None)
            if asset and asset.get("url"):
                zip_bytes = _request(asset["url"], token, "application/octet-stream")
            elif direct_url:
                zip_bytes = _request(direct_url, token, "application/octet-stream")
            else:
                names = [a.get("name") for a in assets]
                raise RuntimeError(f"Asset {ASSET_NAME!r} not found on release {RELEASE_TAG}. Found: {names}")
        elif direct_url:
            req = urllib.request.Request(direct_url, headers={"User-Agent": "rapid-api"})
            with urllib.request.urlopen(req, timeout=600) as resp:
                zip_bytes = resp.read()
        else:
            raise RuntimeError("Set GITHUB_TOKEN or ML_ARTIFACTS_URL to download ML artifacts.")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Download failed HTTP {e.code}: {body[:500]}") from e

    zip_path = MODEL_DIR / "_download.zip"
    zip_path.write_bytes(zip_bytes)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(MODEL_DIR)
    zip_path.unlink(missing_ok=True)

    missing = [name for name in REQUIRED if not (MODEL_DIR / name).is_file()]
    if missing:
        raise RuntimeError(f"After unzip, still missing: {missing}")

    print("ML artifacts ready.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
