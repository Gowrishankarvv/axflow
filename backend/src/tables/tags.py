from __future__ import annotations

from django.db.models import QuerySet

from core.models import Tag


def tag_qs() -> QuerySet[Tag]:
    return Tag.objects.all()


def get_tag_by_id(tag_id: int) -> Tag | None:
    return tag_qs().filter(id=tag_id).first()


def get_active_tags() -> QuerySet[Tag]:
    return tag_qs().filter(is_active=True)
