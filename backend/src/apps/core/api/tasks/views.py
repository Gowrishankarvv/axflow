from __future__ import annotations

from datetime import timedelta
from typing import cast

from django.db.models import DurationField, Q, Sum
from django.db.models.functions import Coalesce
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.selectors import build_visible_user_ids
from tables import ProjectAssignment, Task, TaskAssignment, User
from core.permissions import IsManager
from core.serializers import TaskAssignmentSerializer, TaskSerializer


class TaskAssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = TaskAssignmentSerializer
    permission_classes = [IsAuthenticated, IsManager]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["assignee", "task"]
    ordering_fields = ["id", "start_date", "end_date"]

    def get_queryset(self):
        user = cast(User, self.request.user)
        base = (
            TaskAssignment.objects.select_related("task__project", "assignee", "assigned_by")
            .all()
            .order_by("id")
        )
        if user.is_superuser or user.role == "superuser":
            return base
        return base.filter(assignee_id__in=build_visible_user_ids(user))

    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["project", "status"]
    ordering_fields = ["created_at", "due_date", "id"]

    def get_queryset(self):
        user = cast(User, self.request.user)
        qs = (
            Task.objects.select_related("project", "created_by")
            .prefetch_related("assignees")
            .annotate(
                user_total_hours=Coalesce(
                    Sum("timeentry__duration", filter=Q(timeentry__user=user)),
                    timedelta(0),
                    output_field=DurationField(),
                )
            )
            .order_by("-created_at")
        )
        project = self.request.query_params.get("project")
        if project:
            return qs.filter(project_id=project)
        return qs

    def perform_create(self, serializer):
        user = cast(User, self.request.user)
        project = serializer.validated_data.get("project")
        project_id = self.request.data.get("project") or (project.id if project else None)
        assignees = serializer.validated_data.get("assignees", [])

        if user.role == "employee" and user.id not in assignees:
            if project_id and not ProjectAssignment.objects.filter(project_id=project_id, assignee_id=user.id).exists():
                from rest_framework.exceptions import PermissionDenied

                raise PermissionDenied("You must be assigned to this project to create tasks.")
            assignees.append(user.id)
            serializer.validated_data["assignees"] = assignees

        # Assigning a user to a task auto-adds them to that task's project
        # (instead of rejecting non-members). Idempotent via the unique
        # (project, assignee) constraint.
        if assignees and project_id:
            for assignee_id in assignees:
                ProjectAssignment.objects.get_or_create(
                    project_id=project_id,
                    assignee_id=assignee_id,
                    defaults={"assigned_by": user},
                )

        serializer.save(created_by=user)

    def _restrict_updatable_fields(self, request, instance: Task):
        user = cast(User, request.user)
        if user.role == "employee":
            is_assignee = instance.assignees.filter(id=user.id).exists()
            if "status" in request.data and is_assignee:
                allowed_fields = {"status"}
                for field in list(request.data.keys()):
                    if field not in allowed_fields:
                        del request.data[field]
                return
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Employees can only update status of their assigned tasks.")

        if user.role == "manager":
            allowed_fields = {"title", "description", "due_date", "status"}
            for field in list(request.data.keys()):
                if field not in allowed_fields:
                    del request.data[field]

    def update(self, request, *args, **kwargs):
        instance: Task = self.get_object()
        self._restrict_updatable_fields(request, instance)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        instance: Task = self.get_object()
        self._restrict_updatable_fields(request, instance)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        user = cast(User, request.user)
        if not (user.is_superuser or user.role in ("superuser", "manager")):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Only admin/manager can delete tasks")
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["get"])
    def my_notifications(self, request):
        qs = self.get_queryset().filter(assignees=cast(User, request.user)).exclude(status="done").order_by("-created_at")
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)
