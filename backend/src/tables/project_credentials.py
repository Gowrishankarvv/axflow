from __future__ import annotations

from django.db.models import QuerySet

from core.models import ProjectCredential


def credential_qs() -> QuerySet[ProjectCredential]:
    return ProjectCredential.objects.all()
