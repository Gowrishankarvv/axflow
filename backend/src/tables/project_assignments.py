from __future__ import annotations

from django.db.models import QuerySet

from core.models import ProjectAssignment


def project_assignment_qs() -> QuerySet[ProjectAssignment]:
    return ProjectAssignment.objects.all()


def get_project_assignments_for_project(project_id: int) -> QuerySet[ProjectAssignment]:
    return project_assignment_qs().filter(project_id=project_id)


def get_project_assignments_for_user(user_id: int) -> QuerySet[ProjectAssignment]:
    return project_assignment_qs().filter(assignee_id=user_id)
