from __future__ import annotations

from django.db.models import QuerySet

from core.models import Ticket


def ticket_qs() -> QuerySet[Ticket]:
    return Ticket.objects.all()
