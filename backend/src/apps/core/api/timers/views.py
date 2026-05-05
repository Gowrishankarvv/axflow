from __future__ import annotations

from datetime import datetime
from typing import cast

from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from tables import ActiveTimeEntry, Project, Tag, Task, TimeEntry, User
from core.serializers import ActiveTimeEntrySerializer, TimeEntrySerializer

from apps.core.api.time_entries.services import (
    coerce_bool,
    coerce_str,
    enforce_project_monthly_threshold,
    flatten_value,
    resolve_target_user,
    validate_project_access,
    validate_task_access,
)


class TimeEntryTimerBase(APIView):
    permission_classes = [IsAuthenticated]

    def _get_target_user(self, request: Request) -> User:
        request_user = cast(User, request.user)
        data_user_id = flatten_value(request.data.get("user_id")) if hasattr(request, "data") else None
        qp_user_id = flatten_value(request.query_params.get("user_id")) if hasattr(request, "query_params") else None
        target_identifier = data_user_id or qp_user_id
        return resolve_target_user(request_user, target_identifier)

    def _ensure_aware_datetime(self, dt: datetime | None) -> datetime:
        if dt is None:
            raise serializers.ValidationError({"datetime": "Datetime value is required"})
        if timezone.is_naive(dt):
            return timezone.make_aware(dt, timezone.get_current_timezone())
        return dt


class TimeEntryStartView(TimeEntryTimerBase):
    def post(self, request: Request):
        user = self._get_target_user(request)
        if ActiveTimeEntry.objects.filter(user=user).exists():
            return Response({"detail": "An active timer already exists."}, status=400)

        raw_project = flatten_value(request.data.get("project"))
        if raw_project in (None, ""):
            return Response({"detail": "project is required"}, status=400)
        try:
            project_id = int(raw_project)
        except (TypeError, ValueError):
            return Response({"detail": "Invalid project value"}, status=400)

        try:
            project = Project.objects.get(id=project_id)
        except Project.DoesNotExist:
            return Response({"detail": "Project not found"}, status=404)

        task = None
        raw_task = flatten_value(request.data.get("task"))
        if raw_task not in (None, ""):
            try:
                task_id = int(raw_task)
            except (TypeError, ValueError):
                return Response({"detail": "Invalid task value"}, status=400)
            try:
                task = Task.objects.get(id=task_id)
            except Task.DoesNotExist:
                return Response({"detail": "Task not found"}, status=404)

        validate_project_access(user, project)
        validate_task_access(user, task, project)

        start_raw = flatten_value(request.data.get("start_datetime"))
        if start_raw:
            parsed = parse_datetime(start_raw)
            if not parsed:
                return Response({"detail": "Invalid start_datetime"}, status=400)
            start_dt = self._ensure_aware_datetime(parsed)
        else:
            start_dt = timezone.now()

        description = coerce_str(request.data.get("description", "")).strip()
        active = ActiveTimeEntry.objects.create(
            user=user,
            project=project,
            task=task,
            start_datetime=start_dt,
            description=description,
        )
        return Response(ActiveTimeEntrySerializer(active).data, status=201)


class TimeEntryStopView(TimeEntryTimerBase):
    def post(self, request: Request):
        user = self._get_target_user(request)
        active = ActiveTimeEntry.objects.select_related("project", "task", "user").filter(user=user).first()
        if not active:
            return Response({"detail": "No active timer found."}, status=404)

        project = active.project
        task = active.task

        override_project = flatten_value(request.data.get("project"))
        if override_project not in (None, ""):
            try:
                override_project_id = int(override_project)
            except (TypeError, ValueError):
                return Response({"detail": "Invalid project value"}, status=400)
            if override_project_id != project.id:
                try:
                    project = Project.objects.get(id=override_project_id)
                except Project.DoesNotExist:
                    return Response({"detail": "Project not found"}, status=404)

        override_task = flatten_value(request.data.get("task"))
        if override_task not in (None, ""):
            try:
                override_task_id = int(override_task)
            except (TypeError, ValueError):
                return Response({"detail": "Invalid task value"}, status=400)
            try:
                task = Task.objects.get(id=override_task_id)
            except Task.DoesNotExist:
                return Response({"detail": "Task not found"}, status=404)

        validate_project_access(user, project)
        validate_task_access(user, task, project)

        end_raw = flatten_value(request.data.get("end_datetime"))
        if end_raw:
            parsed = parse_datetime(end_raw)
            if not parsed:
                return Response({"detail": "Invalid end_datetime"}, status=400)
            end_dt = self._ensure_aware_datetime(parsed)
        else:
            end_dt = timezone.now()

        if end_dt <= active.start_datetime:
            return Response({"detail": "end_datetime must be greater than start_datetime"}, status=400)

        description = coerce_str(request.data.get("description", active.description or "")).strip()
        tags = request.data.get("tags") or []

        confirm_exceed = coerce_bool(request.data.get("confirm_exceed"))
        enforce_project_monthly_threshold(project, active.start_datetime, end_dt, confirm_exceed)

        new_entry = TimeEntry.objects.create(
            user=user,
            project=project,
            task=task,
            start_datetime=active.start_datetime,
            end_datetime=end_dt,
            duration=end_dt - active.start_datetime,
            description=description,
        )

        if isinstance(tags, (list, tuple)) and tags:
            tag_ids = list(Tag.objects.filter(id__in=tags).values_list("id", flat=True))
            if tag_ids:
                new_entry.tags.set(tag_ids)

        active.delete()
        return Response(TimeEntrySerializer(new_entry, context={"request": request}).data, status=201)


class TimeEntryCurrentView(TimeEntryTimerBase):
    def get(self, request: Request):
        user = self._get_target_user(request)
        active = ActiveTimeEntry.objects.select_related("project", "task", "user").filter(user=user).first()
        if not active:
            return Response(None)
        return Response(ActiveTimeEntrySerializer(active).data)
