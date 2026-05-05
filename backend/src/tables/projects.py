from __future__ import annotations

from django.db.models import QuerySet

from core.models import Project


def project_qs() -> QuerySet[Project]:
    return Project.objects.all()


def get_project_by_id(project_id: int) -> Project | None:
    return project_qs().filter(id=project_id).first()
