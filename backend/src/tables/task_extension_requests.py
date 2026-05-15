from __future__ import annotations

from django.db.models import QuerySet

from core.models import TaskExtensionRequest


def extension_request_qs() -> QuerySet[TaskExtensionRequest]:
    return TaskExtensionRequest.objects.all()
