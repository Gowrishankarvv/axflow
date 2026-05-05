from __future__ import annotations

from django.db.models import QuerySet

from core.models import Invoice


def invoice_qs() -> QuerySet[Invoice]:
    return Invoice.objects.all()


def get_invoices_for_client(client_id: int) -> QuerySet[Invoice]:
    return invoice_qs().filter(client_id=client_id)
