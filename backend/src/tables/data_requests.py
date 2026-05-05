from __future__ import annotations

from django.db.models import QuerySet

from core.models import DataRequest


def data_request_qs() -> QuerySet[DataRequest]:
    return DataRequest.objects.all()


def get_data_request_by_id(request_id: int) -> DataRequest | None:
    return data_request_qs().filter(id=request_id).first()
