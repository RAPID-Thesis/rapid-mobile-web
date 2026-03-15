from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext

from .schemas import AuthenticatedUser

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")

ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
SECRET_KEY = os.getenv("JWT_SECRET_KEY")

if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY must be set in backend/.env before starting the API.")

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def _build_dummy_users() -> dict[str, dict[str, str]]:
    demo_users = [
        {
            "username": "inspector@lgu.gov.ph",
            "password": "RadarSecure123!",
            "full_name": "RADAR Field Inspector",
            "role": "inspector",
            "lgu_code": "LGU-BATANGAS",
        },
        {
            "username": "drrmo@lgu.gov.ph",
            "password": "RadarSecure456!",
            "full_name": "RADAR DRRMO Officer",
            "role": "drrmo",
            "lgu_code": "LGU-BATANGAS",
        },
    ]

    return {
        user["username"]: {
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"],
            "lgu_code": user["lgu_code"],
            "password_hash": pwd_context.hash(user["password"]),
        }
        for user in demo_users
    }


_DUMMY_USERS = _build_dummy_users()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_user_by_username(username: str) -> AuthenticatedUser | None:
    user = _DUMMY_USERS.get(username)
    if user is None:
        return None

    return AuthenticatedUser(
        username=user["username"],
        full_name=user["full_name"],
        role=user["role"],
        lgu_code=user["lgu_code"],
    )


def authenticate_user(username: str, password: str) -> AuthenticatedUser | None:
    user = _DUMMY_USERS.get(username)
    if user is None or not verify_password(password, user["password_hash"]):
        return None

    return get_user_by_username(username)


def create_access_token(data: dict[str, str], expires_delta: timedelta | None = None) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode = data.copy()
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    username = payload.get("sub")
    if not isinstance(username, str) or not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    current_user = get_user_by_username(username)
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User referenced by token no longer exists.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return current_user
