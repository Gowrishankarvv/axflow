from __future__ import annotations

from django.db.models import QuerySet

from core.models import Lead


def lead_qs() -> QuerySet[Lead]:
    return Lead.objects.all()


def get_lead_by_id(lead_id: int) -> Lead | None:
    return lead_qs().filter(id=lead_id).first()
