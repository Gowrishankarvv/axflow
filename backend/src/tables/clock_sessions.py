from __future__ import annotations

from django.db.models import QuerySet

from core.models import ClockSession


def clock_session_qs() -> QuerySet[ClockSession]:
    return ClockSession.objects.all()


def get_active_clock_session_for_user(user_id: int) -> ClockSession | None:
    return clock_session_qs().filter(user_id=user_id, clock_out_time__isnull=True).first()


def get_recent_clock_sessions_for_user(user_id: int, limit: int = 5) -> QuerySet[ClockSession]:
    return clock_session_qs().filter(user_id=user_id).order_by('-clock_in_time')[:limit]
