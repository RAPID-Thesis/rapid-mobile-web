from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env"
    )


@lru_cache(maxsize=1)
def get_supabase_admin() -> Client:
    """Service-role client — bypasses RLS. Use only in backend."""
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


@lru_cache(maxsize=1)
def get_supabase_public() -> Client:
    """Anon-key client — subject to RLS."""
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
