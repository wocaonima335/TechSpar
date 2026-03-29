"""Authentication and authorization helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from backend.config import settings
from backend.models import AuthUser, UserRole, UserStatus
from backend.storage.users import get_user_by_id

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(user: AuthUser) -> str:
    if not settings.jwt_secret:
        raise RuntimeError("JWT_SECRET is not configured")
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": user.id,
        "username": user.username,
        "role": user.role.value,
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> dict:
    if not settings.jwt_secret:
        raise RuntimeError("JWT_SECRET is not configured")
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])


def _row_to_auth_user(row: dict | None) -> AuthUser | None:
    if not row:
        return None
    return AuthUser(
        id=row["id"],
        username=row["username"],
        display_name=row["display_name"],
        role=UserRole(row["role"]),
        status=UserStatus(row["status"]),
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthUser:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = _row_to_auth_user(get_user_by_id(user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is disabled")
    return user


def require_admin(current_user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return current_user
