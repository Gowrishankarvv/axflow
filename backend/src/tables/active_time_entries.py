from __future__ import annotations

from django.db.models import QuerySet

from core.models import ActiveTimeEntry


def active_time_entry_qs() -> QuerySet[ActiveTimeEntry]:
    return ActiveTimeEntry.objects.all()


def get_active_time_entry_for_user(user_id: int) -> ActiveTimeEntry | None:
    return active_time_entry_qs().filter(user_id=user_id).first()
