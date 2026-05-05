from __future__ import annotations

from django.db.models import QuerySet

from core.models import Task


def task_qs() -> QuerySet[Task]:
    return Task.objects.all()


def get_task_by_id(task_id: int) -> Task | None:
    return task_qs().filter(id=task_id).first()


def get_open_tasks_for_user(user_id: int) -> QuerySet[Task]:
    return task_qs().filter(assignees__id=user_id).exclude(status='done')
