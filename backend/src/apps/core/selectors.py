from __future__ import annotations

from typing import Optional

from tables import User, get_user_by_email as table_get_user_by_email, get_user_by_username as table_get_user_by_username, get_visible_user_ids


def get_user_by_email(email: str) -> Optional[User]:
    return table_get_user_by_email(email)


def get_user_by_username(username: str) -> Optional[User]:
    return table_get_user_by_username(username)


def build_visible_user_ids(user: User) -> set[int]:
    return get_visible_user_ids(user)
