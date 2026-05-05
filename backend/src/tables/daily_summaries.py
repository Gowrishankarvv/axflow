from __future__ import annotations

from datetime import date

from django.db.models import QuerySet

from core.models import DailySummary


def daily_summary_qs() -> QuerySet[DailySummary]:
    return DailySummary.objects.all()


def get_daily_summaries_for_user(user_id: int, start_date: date, end_date: date) -> QuerySet[DailySummary]:
    return daily_summary_qs().filter(user_id=user_id, date__range=[start_date, end_date])
