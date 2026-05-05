from __future__ import annotations

from typing import Any, Dict

from rest_framework_simplejwt.tokens import RefreshToken

from tables import User


def normalize_email(value: str) -> str:
    return (value or "").strip().lower()


def issue_tokens(user: User) -> Dict[str, str]:
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def set_user_password(user: User, password: str) -> None:
    user.set_password(password)
    user.must_set_password = False
    user.save(update_fields=["password", "must_set_password"])


def logout_with_refresh_token(refresh_token: str | None) -> None:
    if not refresh_token:
        return
    token = RefreshToken(refresh_token)
    token.blacklist()


def auth_me_payload(user: User, request: Any) -> Dict[str, Any]:
    client_data = None
    if user.client_org:
        client_data = {
            "id": user.client_org.id,
            "name": user.client_org.name,
            "logo": request.build_absolute_uri(user.client_org.logo.url) if user.client_org.logo else None,
        }
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "position": user.position,
        "role": user.role,
        "client_org": client_data,
    }
