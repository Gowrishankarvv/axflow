from __future__ import annotations

from typing import cast

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.filters import OrderingFilter
from rest_framework.permissions import IsAuthenticated

from apps.core.selectors import build_visible_user_ids
from tables import Project, ProjectAssignment, TaskAssignment, TimeEntry, User
from core.serializers import ProjectAssignmentSerializer, ProjectSerializer


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["created_by"]
    ordering_fields = ["created_at", "name", "id"]

    def get_queryset(self):
        user = cast(User, self.request.user)
        qs = (
            Project.objects.all()
            .order_by("-created_at")
            .prefetch_related("projectassignment_set__assignee", "tasks")
            .select_related("created_by")
        )

        # Superusers see all projects.
        if user.is_superuser or user.role == "superuser":
            return qs

        # Clients only see projects for their organization.
        if user.role == "client":
            return qs.filter(client=user.client_org)

        # Managers and employees see projects assigned to themselves and,
        # for managers, to any users in their visibility tree.
        visible_user_ids = build_visible_user_ids(user)
        return qs.filter(projectassignment__assignee_id__in=visible_user_ids).distinct()

    def perform_create(self, serializer):
        user = self.request.user
        # Allow both superusers and managers to create projects, matching the
        # permissions used elsewhere (e.g. project assignments and updates).
        if not (user.is_superuser or user.role in ("superuser", "manager")):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Only managers/superusers can create projects")
        serializer.save(created_by=user)

    def perform_update(self, serializer):
        user = self.request.user
        if not (user.is_superuser or user.role in ("superuser", "manager")):
            instance = self.get_object()
            if not ProjectAssignment.objects.filter(project=instance, assignee=user).exists():
                from rest_framework.exceptions import PermissionDenied

                raise PermissionDenied("Only admin/manager or assigned users can update projects")

        instance = self.get_object()
        old_billable = instance.billable
        new_billable = serializer.validated_data.get("billable", old_billable)
        project = serializer.save()

        if old_billable != new_billable:
            TimeEntry.objects.filter(project=project).update(billable=new_billable)


class ProjectAssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectAssignmentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["assignee", "project"]
    ordering_fields = ["id", "start_date", "end_date"]

    def get_queryset(self):
        user = cast(User, self.request.user)
        base = ProjectAssignment.objects.select_related("project", "assignee", "assigned_by").all().order_by("id")
        if user.is_superuser or user.role == "superuser":
            return base
        return base.filter(assignee_id__in=build_visible_user_ids(user))

    def perform_create(self, serializer):
        user = self.request.user
        if not (user.is_superuser or user.role in ("superuser", "manager")):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Only managers/superusers can create project assignments")
        serializer.save(assigned_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        user = request.user
        if not (user.is_superuser or user.role in ("superuser", "manager")):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Only managers/superusers can delete project assignments")

        instance: ProjectAssignment = self.get_object()
        TaskAssignment.objects.filter(task__project_id=instance.project_id, assignee_id=instance.assignee_id).delete()
        return super().destroy(request, *args, **kwargs)
