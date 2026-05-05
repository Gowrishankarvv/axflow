from __future__ import annotations

from datetime import datetime, time
from typing import Any, cast

import pytz
from django.db.models import Q
from django.utils import timezone
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.selectors import build_visible_user_ids
from tables import ClockSession, Project, ProjectAssignment, Tag, Task, TimeEntry, User
from core.serializers import ClockSessionSerializer, ProjectSerializer, TagSerializer, TaskSerializer, TimeEntrySerializer, UserSerializer


def _coerce_int(value: Any) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        value = value.strip()
        if value:
            return int(value)
    raise ValueError("Invalid integer value")


def _get_query_str(request: Request, key: str, default: str | None = None) -> str | None:
    value = request.query_params.get(key, default)
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
    else:
        value = str(value)
    return value or None


class AppInitialDataView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request):
        user = cast(User, request.user)
        tz = pytz.timezone("Asia/Kolkata")
        now_ist = timezone.now().astimezone(tz)

        start_of_month = now_ist.replace(day=1).date()
        today = now_ist.date()
        lite = request.query_params.get("lite") in ("1", "true", "True")

        visible_user_ids = list(build_visible_user_ids(user))
        is_superuser = user.is_superuser or user.role == "superuser"
        is_manager = user.role == "manager"

        def get_users():
            qs = User.objects.all() if is_superuser else User.objects.filter(id__in=visible_user_ids)
            qs = qs.exclude(role="client")
            if lite:
                return list(qs.values("id", "first_name", "last_name", "username", "role", "position", "manager_id"))
            return UserSerializer(qs, many=True).data

        def get_projects():
            if is_superuser:
                qs = Project.objects.all()
            else:
                assigned_ids = ProjectAssignment.objects.filter(assignee_id__in=visible_user_ids).values_list("project_id", flat=True)
                qs = Project.objects.filter(id__in=assigned_ids)

            if lite:
                return list(qs.values("id", "name", "description", "monthly_threshold_hours"))
            return ProjectSerializer(qs.prefetch_related("projectassignment_set__assignee"), many=True, context={"request": request}).data

        def get_tasks(project_ids):
            qs = Task.objects.filter(project_id__in=project_ids).exclude(status="done")
            if lite:
                qs = qs.prefetch_related("assignees").only("id", "title", "status", "due_date", "project_id")
                return [
                    {
                        "id": task.id,
                        "title": task.title,
                        "status": task.status,
                        "due_date": task.due_date,
                        "project": task.project_id,
                        "assignees_ids": [assignee.id for assignee in task.assignees.all()],
                    }
                    for task in qs
                ]
            qs = qs.select_related("project", "created_by").prefetch_related("assignees")
            return TaskSerializer(qs, many=True, context={"request": request}).data

        def get_time_entries():
            start_dt = tz.localize(datetime.combine(start_of_month, time.min))
            end_dt = tz.localize(datetime.combine(today, time.max))

            qs = (
                TimeEntry.objects.select_related("user", "project", "task", "manager_comment_by")
                .filter(start_datetime__range=(start_dt, end_dt))
                .only(
                    "id",
                    "user_id",
                    "project_id",
                    "task_id",
                    "start_datetime",
                    "end_datetime",
                    "duration",
                    "description",
                    "manager_comment",
                    "manager_comment_at",
                    "manager_comment_by_id",
                    "state",
                    "created_at",
                    "updated_at",
                    "user__first_name",
                    "user__username",
                    "project__name",
                    "task__title",
                    "manager_comment_by__first_name",
                    "manager_comment_by__username",
                )
                .prefetch_related("tags")
            )

            if not is_superuser:
                if is_manager:
                    qs = qs.filter(Q(user_id__in=visible_user_ids) | Q(visible_to=user))
                else:
                    qs = qs.filter(Q(user_id=user.id) | Q(visible_to=user))

            qs = qs.order_by("-start_datetime", "-created_at")
            page = _get_query_str(request, "page")
            page_size_param = _get_query_str(request, "page_size")

            if page or page_size_param:
                paginator = PageNumberPagination()
                paginator.page_size = _coerce_int(page_size_param) if page_size_param else 100
                try:
                    page_obj = paginator.paginate_queryset(qs, request, view=self)
                except Exception:
                    return []
                return TimeEntrySerializer(page_obj, many=True).data

            qs = qs[:100]
            if not lite:
                return TimeEntrySerializer(qs, many=True).data

            data = []
            for entry in qs:
                tags = [tag.id for tag in entry.tags.all()]
                user_obj = getattr(entry, "user", None)
                manager = getattr(entry, "manager_comment_by", None)
                project_obj = getattr(entry, "project", None)
                task_obj = getattr(entry, "task", None)
                data.append(
                    {
                        "id": entry.id,
                        "user": entry.user_id,
                        "user_name": (user_obj.first_name or user_obj.username) if user_obj else None,
                        "project": entry.project_id,
                        "project_name": project_obj.name if project_obj else None,
                        "task": entry.task_id,
                        "task_title": task_obj.title if task_obj else None,
                        "start_datetime": entry.start_datetime.isoformat() if entry.start_datetime else None,
                        "end_datetime": entry.end_datetime.isoformat() if entry.end_datetime else None,
                        "duration": str(entry.duration) if entry.duration is not None else None,
                        "description": entry.description,
                        "manager_comment": entry.manager_comment,
                        "manager_comment_at": entry.manager_comment_at.isoformat() if entry.manager_comment_at else None,
                        "manager_comment_by": entry.manager_comment_by_id,
                        "manager_comment_by_name": (manager.first_name or manager.username) if manager else None,
                        "tag_ids": tags,
                    }
                )
            return data

        def get_tags():
            return TagSerializer(Tag.objects.filter(is_active=True).order_by("category", "name"), many=True).data

        def get_active_session():
            active = ClockSession.get_active_session(user)
            return ClockSessionSerializer(active).data if active else None

        from concurrent.futures import ThreadPoolExecutor

        with ThreadPoolExecutor(max_workers=6) as executor:
            future_users = executor.submit(get_users)
            future_projects = executor.submit(get_projects)
            future_tags = executor.submit(get_tags)
            future_session = executor.submit(get_active_session)

            def get_project_ids_and_tasks():
                if is_superuser:
                    project_ids = list(Project.objects.values_list("id", flat=True))
                else:
                    assigned_ids = ProjectAssignment.objects.filter(assignee_id__in=visible_user_ids).values_list("project_id", flat=True)
                    project_ids = list(Project.objects.filter(id__in=assigned_ids).values_list("id", flat=True))
                return get_tasks(project_ids)

            future_tasks = executor.submit(get_project_ids_and_tasks)
            future_entries = executor.submit(get_time_entries)

            users_data = future_users.result()
            projects_data = future_projects.result()
            tags_data = future_tags.result()
            active_session_data = future_session.result()
            tasks_data = future_tasks.result()
            entries_data = future_entries.result()

        role_permissions = {
            "role": user.role,
            "is_superuser": bool(user.is_superuser or user.role == "superuser"),
            "is_manager": user.role == "manager",
            "is_employee": user.role == "employee",
        }

        return Response(
            {
                "me": UserSerializer(user).data,
                "users": users_data,
                "projects": projects_data,
                "tasks": tasks_data,
                "time_entries": entries_data,
                "tags": tags_data,
                "active_clock_session": active_session_data,
                "meta": {
                    "start_date": start_of_month.isoformat(),
                    "end_date": today.isoformat(),
                    "page_size": 10000,
                    "generated_at": now_ist.isoformat(),
                    "role_permissions": role_permissions,
                },
            }
        )


class ProjectsCombinedView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request):
        user = cast(User, request.user)
        visible_user_ids = list(build_visible_user_ids(user))
        is_superuser = user.is_superuser or user.role == "superuser"
        qp_assignee_param = request.query_params.get("assignee")

        projects_qs = Project.objects.all().order_by("-created_at")

        # Superusers see all projects; others are restricted by assignments / hierarchy.
        if not is_superuser:
            projects_qs = projects_qs.filter(projectassignment__assignee_id__in=visible_user_ids)

        projects_qs = projects_qs.select_related("created_by").prefetch_related("tasks__assignees")

        if qp_assignee_param and isinstance(qp_assignee_param, str):
            try:
                assignee_id = int(qp_assignee_param) if qp_assignee_param != "me" else user.id
                projects_qs = projects_qs.filter(tasks__assignees__id=assignee_id).distinct()
            except Exception:
                pass

        project_ids = list(projects_qs.values_list("id", flat=True))
        tasks_qs = (
            Task.objects.filter(project_id__in=project_ids)
            .select_related("project", "created_by")
            .prefetch_related("assignees")
            .order_by("-created_at")
        )
        if qp_assignee_param and isinstance(qp_assignee_param, str):
            try:
                assignee_id = int(qp_assignee_param) if qp_assignee_param != "me" else user.id
                tasks_qs = tasks_qs.filter(assignees__id=assignee_id)
            except Exception:
                pass

        from collections import defaultdict

        tasks_by_project: dict[int, list[dict[str, Any]]] = defaultdict(list)
        status_counts: dict[int, dict[str, int]] = defaultdict(lambda: {"todo": 0, "in_progress": 0, "done": 0})

        for task in tasks_qs:
            assigned = list(task.assignees.all())
            tasks_by_project[task.project_id].append(
                {
                    "task_id": task.id,
                    "task_name": task.title,
                    "assigned_to": [{"id": assignee.id, "name": (assignee.first_name or assignee.username)} for assignee in assigned],
                    "status": task.status,
                    "due_date": task.due_date,
                    "description": task.description,
                }
            )
            status_counts[task.project_id][task.status] = status_counts[task.project_id].get(task.status, 0) + 1

        data = []
        for project in projects_qs:
            manager = project.created_by
            data.append(
                {
                    "project_id": project.id,
                    "project_name": project.name,
                    "description": project.description,
                    "manager": {
                        "id": manager.id if manager else None,
                        "name": (manager.first_name or manager.username) if manager else None,
                    },
                    "tasks": tasks_by_project.get(project.id, []),
                    "stats": {
                        "todo_count": status_counts[project.id]["todo"],
                        "in_progress_count": status_counts[project.id]["in_progress"],
                        "completed_count": status_counts[project.id]["done"],
                        "total_tasks": sum(status_counts[project.id].values()),
                    },
                }
            )

        return Response(data)
