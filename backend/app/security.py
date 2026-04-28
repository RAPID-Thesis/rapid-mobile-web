from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .schemas import AuthenticatedUser
from .supabase_client import get_supabase_admin

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthenticatedUser:
    """Validate Supabase JWT and return the authenticated user profile."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    supabase = get_supabase_admin()

    try:
        user_response = supabase.auth.get_user(jwt=token)
    except Exception as exc:
        logger.warning("Supabase auth.get_user failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if user_response is None or user_response.user is None:
        logger.warning("Supabase auth.get_user returned no user (jwt may be invalid or revoked).")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    su_user = user_response.user

    profile_resp = (
        supabase.table("profiles")
        .select("*")
        .eq("id", str(su_user.id))
        .single()
        .execute()
    )

    if not profile_resp.data:
        logger.warning(
            "No profiles row for user id=%s — insert a matching row in public.profiles.",
            su_user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User profile not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    profile = profile_resp.data
    if profile.get("verification_status") != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is still pending admin approval.",
        )

    return AuthenticatedUser(
        id=su_user.id,
        email=profile["email"],
        full_name=profile["full_name"],
        role=profile["role"],
        lgu_code=profile["lgu_code"],
        verification_status=profile["verification_status"],
    )


def require_roles(*allowed_roles: str):
    """Dependency factory that checks if the user has one of the allowed roles."""

    def checker(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role}' is not authorized for this action.",
            )
        return user

    return checker
