from __future__ import annotations

from typing import Any, cast

from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.selectors import build_visible_user_ids
from core.permissions import IsManager
from tables import Project, Task, TaskAssignment, User


class OrganizationTreeView(APIView):
    # Org tree is a manager/superuser-only module.
    permission_classes = [IsManager]

    def get(self, request):
        users_qs = User.objects.filter(is_active=True)
        users_list = list(users_qs.values("id", "username", "first_name", "last_name", "role", "manager_id", "position"))

        nodes = []
        edges = []

        for user in users_list:
            first_name = user["first_name"] or ""
            last_name = user["last_name"] or ""
            username = user["username"] or ""

            if first_name and last_name:
                display_name = f"{first_name} {last_name}"
            elif first_name:
                display_name = first_name
            elif last_name:
                display_name = last_name
            else:
                display_name = username or f"User {user['id']}"

            role_color = {
                "superuser": "#dc2626",
                "manager": "#2563eb",
                "employee": "#16a34a",
            }.get(user["role"], "#6b7280")

            nodes.append(
                {
                    "id": str(user["id"]),
                    "type": "default",
                    "position": {"x": 0, "y": 0},
                    "data": {
                        "label": display_name,
                        "role": user["role"],
                        "position": user["position"],
                        "name": display_name,
                        "subtitle": user["position"] or user["role"],
                        "email": user["username"],
                        "manager": user["manager_id"],
                    },
                    "style": {
                        "background": role_color,
                        "color": "white",
                        "border": "1px solid #222138",
                        "borderRadius": 8,
                    },
                }
            )

            if user["manager_id"]:
                edges.append(
                    {
                        "id": f"{user['manager_id']}-{user['id']}",
                        "source": str(user["manager_id"]),
                        "target": str(user["id"]),
                        "type": "smoothstep",
                        "animated": False,
                        "style": {"stroke": "#b1b1b7", "strokeWidth": 2},
                        "markerEnd": {"type": "arrowclosed", "color": "#b1b1b7"},
                    }
                )

        if not users_list:
            nodes = [
                {
                    "id": "test-1",
                    "type": "default",
                    "position": {"x": 100, "y": 100},
                    "data": {
                        "label": "No Users Found",
                        "role": "employee",
                        "position": "Test",
                        "name": "No Users Found",
                        "subtitle": "Create users in Admin panel",
                    },
                    "style": {
                        "background": "#6b7280",
                        "color": "white",
                        "border": "1px solid #222138",
                        "borderRadius": 8,
                    },
                }
            ]

        return Response({"nodes": nodes, "edges": edges})


class OrganizationHierarchyView(APIView):
    permission_classes = [IsManager]

    def get(self, request):
        user = cast(User, request.user)
        if user.is_superuser or user.role == "superuser":
            users_qs = User.objects.filter(is_active=True)
        else:
            visible_ids = build_visible_user_ids(user)
            users_qs = User.objects.filter(id__in=visible_ids, is_active=True)

        users_list = list(users_qs.values("id", "username", "first_name", "last_name", "role", "manager_id", "position"))

        nodes = []
        edges = []

        for row in users_list:
            display_name = (row["first_name"] + " " + row["last_name"]).strip() or row["username"]
            role_color = {
                "superuser": "#dc2626",
                "manager": "#2563eb",
                "employee": "#16a34a",
            }.get(row["role"], "#6b7280")

            nodes.append(
                {
                    "id": str(row["id"]),
                    "type": "default",
                    "position": {"x": 0, "y": 0},
                    "data": {
                        "label": display_name,
                        "role": row["role"],
                        "position": row["position"],
                        "name": display_name,
                        "subtitle": row["position"] or row["role"],
                    },
                    "style": {
                        "background": role_color,
                        "color": "white",
                        "border": "1px solid #222138",
                        "borderRadius": 8,
                    },
                }
            )

            if row["manager_id"]:
                edges.append(
                    {
                        "id": f"{row['manager_id']}-{row['id']}",
                        "source": str(row["manager_id"]),
                        "target": str(row["id"]),
                        "type": "smoothstep",
                        "animated": False,
                        "style": {"stroke": "#b1b1b7", "strokeWidth": 2},
                    }
                )

        if not users_list:
            nodes = [
                {
                    "id": "test-1",
                    "type": "default",
                    "position": {"x": 100, "y": 100},
                    "data": {
                        "label": "No Users Found",
                        "role": "employee",
                        "position": "Test",
                        "name": "No Users Found",
                        "subtitle": "Create users in Admin panel",
                    },
                    "style": {
                        "background": "#6b7280",
                        "color": "white",
                        "border": "1px solid #222138",
                        "borderRadius": 8,
                    },
                }
            ]

        return Response({"nodes": nodes, "edges": edges})


class TeamManagementView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = cast(User, request.user)
        visible_ids = build_visible_user_ids(user) if (user.is_superuser or user.role in ("superuser", "manager")) else {user.id}

        members = User.objects.filter(id__in=visible_ids).values("id", "first_name", "username", "position")
        assignments = Project.objects.filter(assignees__id__in=visible_ids).values("assignees__id", "id", "name")
        tasks = (
            TaskAssignment.objects.filter(assignee_id__in=visible_ids)
            .select_related("task__project", "assignee")
            .values("task__id", "task__title", "task__status", "task__project_id", "task__project__name", "assignee_id")
        )

        member_map = {
            member["id"]: {
                **member,
                "name": (member["first_name"] or member["username"]),
                "projects": {},
                "status_counts": {"todo": 0, "in_progress": 0, "done": 0},
            }
            for member in members
        }

        for assignment in assignments:
            member = member_map.get(assignment["assignees__id"])
            if member is None:
                continue
            member["projects"].setdefault(assignment["id"], {"id": assignment["id"], "name": assignment["name"], "tasks": []})

        for row in tasks:
            member = member_map.get(row["assignee_id"])
            if member is None:
                continue
            member["status_counts"][row["task__status"]] = member["status_counts"].get(row["task__status"], 0) + 1
            project = member["projects"].setdefault(
                row["task__project_id"],
                {"id": row["task__project_id"], "name": row["task__project__name"], "tasks": []},
            )
            project["tasks"].append({"id": row["task__id"], "title": row["task__title"], "status": row["task__status"]})

        data = list(member_map.values())
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(data, request, view=self)
        if page is not None:
            return paginator.get_paginated_response(page)
        return Response(data)

    def patch(self, request):
        user = cast(User, request.user)
        if not (user.is_superuser or user.role in ("superuser", "manager")):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        task_id = request.data.get("task_id")
        status_value = request.data.get("status")
        if status_value not in dict(Task.STATUS_CHOICES).keys():
            return Response({"detail": "Invalid status"}, status=400)

        try:
            task: Any = Task.objects.get(id=task_id)
        except Task.DoesNotExist:
            return Response({"detail": "Task not found"}, status=404)

        visible_ids = build_visible_user_ids(user)
        assignee_ids = list(TaskAssignment.objects.filter(task=task).values_list("assignee_id", flat=True))
        if assignee_ids and not any(aid in visible_ids for aid in assignee_ids) and not (user.is_superuser or user.role == "superuser"):
            return Response({"detail": "Forbidden"}, status=403)

        task.status = status_value
        task.save(update_fields=["status"])
        return Response({"detail": "Updated"})
