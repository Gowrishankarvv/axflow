from __future__ import annotations

from django.db.models import QuerySet

from core.models import TimeEntry


def time_entry_qs() -> QuerySet[TimeEntry]:
    return TimeEntry.objects.all()


def get_time_entry_by_id(entry_id: int) -> TimeEntry | None:
    return time_entry_qs().filter(id=entry_id).first()


def get_time_entries_for_user(user_id: int) -> QuerySet[TimeEntry]:
    return time_entry_qs().filter(user_id=user_id)
