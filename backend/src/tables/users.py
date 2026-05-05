from __future__ import annotations

from collections import defaultdict

from django.core.cache import cache
from django.db.models import QuerySet

from core.models import User


def user_qs() -> QuerySet[User]:
    return User.objects.all()


def get_user_by_id(user_id: int) -> User | None:
    return user_qs().filter(id=user_id).first()


def get_user_by_email(email: str) -> User | None:
    if not email:
        return None
    return user_qs().filter(email__iexact=email).first()


def get_user_by_username(username: str) -> User | None:
    if not username:
        return None
    return user_qs().filter(username__iexact=username).first()


def get_visible_user_ids(user: User) -> set[int]:
    cache_attr = '_visible_user_ids_cache'
    cached_ids = getattr(user, cache_attr, None)
    if cached_ids is not None:
        return cached_ids

    redis_key = f'visible_user_ids_{user.id}'
    cached_redis = cache.get(redis_key)
    if cached_redis:
        setattr(user, cache_attr, cached_redis)
        return cached_redis

    reports_map: dict[int, list[int]] = defaultdict(list)
    for uid, mid in user_qs().values_list('id', 'manager_id'):
        if mid:
            reports_map[mid].append(uid)

    visible_ids: set[int] = {user.id}
    queue = [user.id]
    while queue:
        current_id = queue.pop(0)
        for child_id in reports_map.get(current_id, []):
            if child_id not in visible_ids:
                visible_ids.add(child_id)
                queue.append(child_id)

    cache.set(redis_key, visible_ids, timeout=3600)
    setattr(user, cache_attr, visible_ids)
    return visible_ids
