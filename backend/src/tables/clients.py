from __future__ import annotations

from django.db.models import QuerySet

from core.models import Client


def client_qs() -> QuerySet[Client]:
    return Client.objects.all()


def get_client_by_id(client_id: int) -> Client | None:
    return client_qs().filter(id=client_id).first()
