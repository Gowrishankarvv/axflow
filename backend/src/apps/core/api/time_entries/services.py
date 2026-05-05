from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from django.db import connection
from django.db.models import Sum
from rest_framework.exceptions import PermissionDenied
from rest_framework import serializers

from apps.core.selectors import build_visible_user_ids
from tables import Project, ProjectAssignment, Task, TimeEntry, User


def enforce_project_monthly_threshold(project: Project, start: datetime, end: datetime, confirm_exceed: bool = False) -> None:
    monthly_threshold_val: Decimal | None = getattr(project, "monthly_threshold_hours", None)
    threshold = float(monthly_threshold_val) if monthly_threshold_val else 0.0
    if threshold <= 0:
        return

    month_start = start.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    current_hours = 0.0
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT total_duration
                FROM core_project_monthly_totals
                WHERE project_id = %s AND month_start = %s
                """,
                [project.id, month_start.date()],
            )
            row = cursor.fetchone()
            if row and row[0]:
                current_hours = row[0].total_seconds() / 3600.0
    except Exception:
        next_month = (month_start + timedelta(days=32)).replace(day=1)
        month_end = next_month - timedelta(microseconds=1)
        total_duration = TimeEntry.objects.filter(
            project=project,
            start_datetime__gte=month_start,
            start_datetime__lte=month_end,
        ).aggregate(total=Sum("duration"))["total"]
        current_hours = (total_duration.total_seconds() / 3600) if total_duration else 0.0

    new_duration = end - start
    new_hours = new_duration.total_seconds() / 3600

    if (current_hours + new_hours) > threshold and not confirm_exceed:
        raise serializers.ValidationError(
            {
                "non_field_errors": [
                    f"Project threshold of {threshold}h exceeded. Current: {current_hours:.2f}h, trying to add {new_hours:.2f}h. Add 'confirm_exceed': true to proceed."
                ]
            }
        )


def coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in ("1", "true", "yes", "y", "on")
    return bool(value)


def flatten_value(value: Any) -> Any:
    if isinstance(value, (list, tuple)):
        return value[0] if value else None
    return value


def coerce_str(value: Any, default: str = "") -> str:
    if isinstance(value, str):
        return value
    if value is None:
        return default
    return str(value)


def validate_project_access(user: User, project: Project) -> None:
    # Superusers/superuser-role can access any project.
    if user.is_superuser or user.role == "superuser":
        return

    # For managers and employees, require that the project is assigned either
    # directly to them or to someone in their visibility tree.
    visible_ids = build_visible_user_ids(user)
    if not ProjectAssignment.objects.filter(project=project, assignee_id__in=visible_ids).exists():
        raise serializers.ValidationError({"project": "User is not assigned to this project."})


def validate_task_access(user: User, task: Task | None, project: Project) -> None:
    if task is None:
        return
    if task.project_id != project.id:
        raise serializers.ValidationError({"task": "Task does not belong to selected project."})
    if user.is_superuser or user.role in ("superuser", "manager"):
        return
    if not task.assignees.filter(id=user.id).exists():
        raise serializers.ValidationError({"task": "User is not assigned to this task."})


def resolve_target_user(request_user: User, target_identifier: Any) -> User:
    if target_identifier in (None, ""):
        return request_user
    if isinstance(target_identifier, str) and target_identifier.lower() == "me":
        return request_user
    if isinstance(target_identifier, int) and target_identifier == request_user.id:
        return request_user

    try:
        target_id = int(target_identifier)
    except (TypeError, ValueError):
        raise serializers.ValidationError({"user_id": "Invalid user_id"})

    if target_id == request_user.id:
        return request_user

    if not (request_user.is_superuser or request_user.role in ("superuser", "manager")):
        raise PermissionDenied("Not allowed to control timers for other users.")

    if not (request_user.is_superuser or request_user.role == "superuser"):
        visible_ids = build_visible_user_ids(request_user)
        if target_id not in visible_ids:
            raise PermissionDenied("User not visible.")

    try:
        return User.objects.get(id=target_id)
    except User.DoesNotExist:
        raise serializers.ValidationError({"user_id": "User not found"})
