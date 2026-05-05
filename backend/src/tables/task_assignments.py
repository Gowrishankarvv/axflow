from __future__ import annotations

from django.db.models import QuerySet

from core.models import TaskAssignment


def task_assignment_qs() -> QuerySet[TaskAssignment]:
    return TaskAssignment.objects.all()


def get_task_assignments_for_task(task_id: int) -> QuerySet[TaskAssignment]:
    return task_assignment_qs().filter(task_id=task_id)


def get_task_assignments_for_user(user_id: int) -> QuerySet[TaskAssignment]:
    return task_assignment_qs().filter(assignee_id=user_id)
