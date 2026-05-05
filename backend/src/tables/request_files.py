from __future__ import annotations

from django.db.models import QuerySet

from core.models import RequestFile


def request_file_qs() -> QuerySet[RequestFile]:
    return RequestFile.objects.all()


def get_request_files_for_request(request_id: int) -> QuerySet[RequestFile]:
    return request_file_qs().filter(request_id=request_id)
