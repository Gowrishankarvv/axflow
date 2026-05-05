from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time
from typing import cast

import pytz
from django.db.models import Exists, OuterRef, Q, Sum
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.selectors import build_visible_user_ids
from tables import Tag, TaskAssignment, TimeEntry, User
from core.serializers import TimeEntrySerializer

from .services import coerce_bool, enforce_project_monthly_threshold


class TimeEntryViewSet(viewsets.ModelViewSet):
    queryset = TimeEntry.objects.all()
    serializer_class = TimeEntrySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["user", "project", "task"]
    ordering_fields = ["start_datetime", "end_datetime", "created_at"]

    def get_queryset(self):
        user = cast(User, self.request.user)
        qs = (
            TimeEntry.objects.select_related("user", "project", "task", "manager_comment_by")
            .prefetch_related("tags")
            .only(
                "id",
                "user_id",
                "project_id",
                "task_id",
                "start_datetime",
                "end_datetime",
                "duration",
                "description",
                "created_at",
                "updated_at",
                "manager_comment",
                "manager_comment_at",
                "manager_comment_by_id",
                "state",
                "user__first_name",
                "user__username",
                "project__name",
                "task__title",
                "manager_comment_by__first_name",
                "manager_comment_by__username",
            )
        )

        overlap_subquery = TimeEntry.objects.filter(
            user_id=OuterRef("user_id"),
            start_datetime__lt=OuterRef("end_datetime"),
            end_datetime__gt=OuterRef("start_datetime"),
        ).exclude(id=OuterRef("id"))
        qs = qs.annotate(has_overlap=Exists(overlap_subquery)).order_by("-start_datetime", "-created_at")

        qp_user_id = self.request.query_params.get("user_id")
        project = self.request.query_params.get("project")
        start_date = self.request.query_params.get("start_date")
        end_date = self.request.query_params.get("end_date")
        team = self.request.query_params.get("team") in ("1", "true", "True")
        visible_user_ids = None

        if qp_user_id:
            if qp_user_id == "me":
                qs = qs.filter(user_id=user.id)
            else:
                qs = qs.filter(user_id=qp_user_id)
        else:
            if not (user.is_superuser or user.role == "superuser"):
                visible_user_ids = build_visible_user_ids(user)
                qs = qs.filter(Q(user_id__in=visible_user_ids) | Q(visible_to=user)).distinct()

        if project:
            qs = qs.filter(project_id=project)

        tz = pytz.timezone("Asia/Kolkata")
        if start_date:
            try:
                s_date = datetime.strptime(start_date, "%Y-%m-%d").date()
                s_dt = tz.localize(datetime.combine(s_date, time.min))
                qs = qs.filter(start_datetime__gte=s_dt)
            except ValueError:
                pass
        if end_date:
            try:
                e_date = datetime.strptime(end_date, "%Y-%m-%d").date()
                e_dt = tz.localize(datetime.combine(e_date, time.max))
                qs = qs.filter(start_datetime__lte=e_dt)
            except ValueError:
                pass

        if team:
            if visible_user_ids is None:
                visible_user_ids = build_visible_user_ids(user)
            qs = qs.filter(user_id__in=visible_user_ids)

        return qs.order_by("-start_datetime", "-created_at")

    def perform_create(self, serializer):
        try:
            project = serializer.validated_data["project"]
            start = serializer.validated_data["start_datetime"]
            end = serializer.validated_data["end_datetime"]
            new_duration = end - start
            confirm_exceed = coerce_bool(self.request.data.get("confirm_exceed"))
            enforce_project_monthly_threshold(project, start, end, confirm_exceed)
            serializer.save(duration=new_duration, billable=project.billable)
        except Exception as exc:
            if isinstance(exc, serializers.ValidationError):
                raise
            raise serializers.ValidationError(f"Failed to create time entry: {str(exc)}")

    def perform_update(self, serializer):
        instance = serializer.instance
        start = serializer.validated_data.get("start_datetime") or getattr(instance, "start_datetime", None)
        end = serializer.validated_data.get("end_datetime") or getattr(instance, "end_datetime", None)
        if not start or not end:
            raise serializers.ValidationError("Both start and end datetime are required")
        serializer.save(duration=end - start)

    def _check_owner_or_manager(self, request, instance: TimeEntry):
        user = cast(User, request.user)
        if not (user.is_superuser or user.role in ("superuser", "manager") or instance.user_id == user.id):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Not allowed to update this entry")

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self._check_owner_or_manager(request, instance)
        return super().destroy(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        self._check_owner_or_manager(request, instance)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        self._check_owner_or_manager(request, instance)
        return super().partial_update(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        project = request.query_params.get("project")
        start_date_str = request.query_params.get("start_date")
        end_date_str = request.query_params.get("end_date")

        if not project or not start_date_str or not end_date_str:
            return Response({"error": "Missing project, start_date or end_date"}, status=400)

        try:
            start_dt = date.fromisoformat(start_date_str)
            end_dt = date.fromisoformat(end_date_str)
            start_datetime = timezone.make_aware(datetime.combine(start_dt, time.min))
            end_datetime = timezone.make_aware(datetime.combine(end_dt, time.max))
        except ValueError:
            return Response({"error": "Invalid date format"}, status=400)

        try:
            qs = TimeEntry.objects.filter(
                project_id=project,
                start_datetime__gte=start_datetime,
                end_datetime__lte=end_datetime,
            ).aggregate(total=Sum("duration"))
            total_duration = qs["total"]
            return Response({"total": str(total_duration) if total_duration else "0:00:00"})
        except Exception as exc:
            return Response({"detail": f"An error occurred while generating the summary: {str(exc)}"}, status=500)

    @action(detail=True, methods=["post"])
    def add_comment(self, request, pk=None):
        instance = self.get_object()
        user = cast(User, request.user)
        if not (user.is_superuser or user.role in ("superuser", "manager")):
            return Response({"detail": "Only managers/superusers can comment"}, status=status.HTTP_403_FORBIDDEN)

        comment = request.data.get("comment", "").strip()
        if not comment:
            return Response({"detail": "comment is required"}, status=400)

        instance.manager_comment = comment
        instance.manager_comment_by = user
        instance.manager_comment_at = timezone.now()
        instance.save(update_fields=["manager_comment", "manager_comment_by", "manager_comment_at"])
        return Response(TimeEntrySerializer(instance).data)

    @action(detail=True, methods=["post"])
    def delete_comment(self, request, pk=None):
        instance = self.get_object()
        user = cast(User, request.user)
        if not (user.is_superuser or user.role in ("superuser", "manager")):
            return Response({"detail": "Only managers/superusers can delete comments"}, status=status.HTTP_403_FORBIDDEN)

        instance.manager_comment = ""
        instance.manager_comment_at = None
        instance.manager_comment_by = None
        instance.save(update_fields=["manager_comment", "manager_comment_at", "manager_comment_by"])
        return Response(TimeEntrySerializer(instance).data)

    @action(detail=False, methods=["get"])
    def comments(self, request):
        user = cast(User, request.user)
        user_id = request.query_params.get("user_id")
        if not user_id:
            return Response({"detail": "user_id is required"}, status=400)

        if user_id == "me":
            target_id = user.id
        else:
            try:
                target_id = int(user_id)
            except Exception:
                return Response({"detail": "Invalid user_id"}, status=400)

        if not (user.is_superuser or user.role == "superuser" or target_id in build_visible_user_ids(user)):
            return Response({"detail": "Forbidden"}, status=403)

        qs = (
            TimeEntry.objects.select_related("user", "project", "task", "manager_comment_by")
            .filter(user_id=target_id)
            .exclude(manager_comment="")
            .exclude(manager_comment__isnull=True)
            .order_by("-manager_comment_at", "-updated_at")
        )
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = TimeEntrySerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = TimeEntrySerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="tag-summary")
    def tag_summary(self, request):
        user = cast(User, request.user)
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        user_id = request.query_params.get("user_id")

        if not start_date or not end_date:
            return Response({"detail": "start_date and end_date are required"}, status=400)

        try:
            start = datetime.fromisoformat(start_date).date()
            end = datetime.fromisoformat(end_date).date()
        except ValueError:
            return Response({"detail": "Invalid date format"}, status=400)

        qs = (
            TimeEntry.objects.filter(start_datetime__date__gte=start, end_datetime__date__lte=end)
            .prefetch_related("tags")
            .distinct()
        )

        if user_id:
            if user_id == "me":
                qs = qs.filter(user=user)
            else:
                try:
                    qs = qs.filter(user_id=int(user_id))
                except ValueError:
                    return Response({"detail": "Invalid user_id"}, status=400)
        elif not (user.is_superuser or user.role == "superuser"):
            visible_ids = build_visible_user_ids(user)
            qs = qs.filter(user_id__in=visible_ids)

        tag_totals: dict[int, dict[str, object]] = {}
        untagged_tag = Tag.objects.filter(name="Untagged", category="system").first()

        for entry in qs:
            seconds = entry.duration.total_seconds() if entry.duration else 0
            entry_tags = entry.tags.all()
            if entry_tags.exists():
                time_per_tag = seconds / len(entry_tags)
                for tag in entry_tags:
                    if tag.id not in tag_totals:
                        tag_totals[tag.id] = {"tag": tag, "total_seconds": 0}
                    tag_totals[tag.id]["total_seconds"] = cast(float, tag_totals[tag.id]["total_seconds"]) + time_per_tag
            elif untagged_tag:
                if untagged_tag.id not in tag_totals:
                    tag_totals[untagged_tag.id] = {"tag": untagged_tag, "total_seconds": 0}
                tag_totals[untagged_tag.id]["total_seconds"] = cast(float, tag_totals[untagged_tag.id]["total_seconds"]) + seconds

        result = []
        for data in tag_totals.values():
            tag = cast(Tag, data["tag"])
            total_seconds = cast(float, data["total_seconds"])
            hours = int(total_seconds // 3600)
            minutes = int((total_seconds % 3600) // 60)
            result.append(
                {
                    "id": tag.id,
                    "name": tag.name,
                    "emoji": tag.emoji,
                    "category": tag.category,
                    "total_hours": hours,
                    "total_minutes": minutes,
                    "total_seconds": total_seconds,
                    "formatted": f"{hours}h {minutes:02d}m",
                }
            )

        result.sort(key=lambda item: item["total_seconds"], reverse=True)
        return Response(result)

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        export = request.query_params.get("export")
        qs = self.get_queryset()
        if export not in ("xlsx", "pdf"):
            return Response({"detail": "export must be xlsx or pdf"}, status=400)

        max_export = 10000
        if qs.count() > max_export:
            return Response(
                {"detail": f"Export limited to {max_export} entries. Please filter your query."},
                status=400,
            )

        entries = qs.select_related("user", "project", "task").values(
            "user__first_name",
            "user__username",
            "project__name",
            "task__title",
            "task__id",
            "start_datetime",
            "end_datetime",
            "duration",
            "description",
        ).order_by("start_datetime")[:max_export]

        task_ids = {row["task__id"] for row in entries if row["task__id"]}
        task_assignees = defaultdict(list)
        if task_ids:
            task_assignments = TaskAssignment.objects.filter(task_id__in=task_ids).select_related("assignee").values(
                "task_id", "assignee__first_name", "assignee__username"
            )
            for assignment in task_assignments:
                name = assignment["assignee__first_name"] or assignment["assignee__username"]
                task_assignees[assignment["task_id"]].append(name)

        if export == "xlsx":
            try:
                from openpyxl import Workbook
            except ImportError:
                return Response({"detail": "XLSX generation not available on server."}, status=501)

            wb = Workbook()
            ws = wb.active
            if ws is None:
                ws = wb.create_sheet("Team Time")
            else:
                ws.title = "Team Time"

            ws.append(["User", "Project", "Task", "Task Assignees", "Start", "End", "Hours", "Description"])
            for row in entries:
                user_name = row["user__first_name"] or row["user__username"]
                hours = round((row["duration"].total_seconds() / 3600.0) if row["duration"] else 0, 2)
                start_dt = row["start_datetime"].replace(tzinfo=None) if row["start_datetime"] else None
                end_dt = row["end_datetime"].replace(tzinfo=None) if row["end_datetime"] else None
                start_str = start_dt.strftime("%Y-%m-%d %H:%M:%S") if start_dt else ""
                end_str = end_dt.strftime("%Y-%m-%d %H:%M:%S") if end_dt else ""
                assignees_str = ", ".join(task_assignees.get(row["task__id"], []))
                ws.append([
                    user_name,
                    row["project__name"],
                    row["task__title"] or "",
                    assignees_str,
                    start_str,
                    end_str,
                    hours,
                    row["description"] or "",
                ])

            from django.http import HttpResponse

            response = HttpResponse(content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            response["Content-Disposition"] = 'attachment; filename="team_time.xlsx"'
            wb.save(response)
            return response

        from io import BytesIO

        from django.http import HttpResponse

        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.pdfgen import canvas
        except Exception:
            return Response({"detail": "PDF generation not available on server."}, status=501)

        response = HttpResponse(content_type="application/pdf")
        response["Content-Disposition"] = 'attachment; filename="team_time.pdf"'
        buffer = BytesIO()
        pdf_canvas = canvas.Canvas(buffer, pagesize=letter)
        y = 750
        pdf_canvas.setFont("Helvetica-Bold", 12)
        pdf_canvas.drawString(50, y, "Team Time Entries")
        y -= 20
        pdf_canvas.setFont("Helvetica", 9)

        for row in entries:
            user_name = row["user__first_name"] or row["user__username"]
            hours = round((row["duration"].total_seconds() / 3600.0) if row["duration"] else 0, 2)
            line = f"{user_name} | {row['project__name']} | {row['task__title'] or ''} | {hours} h"
            pdf_canvas.drawString(50, y, line)
            y -= 12
            if row["description"]:
                pdf_canvas.drawString(60, y, f"- {row['description']}")
                y -= 12
            if y < 50:
                pdf_canvas.showPage()
                y = 750
                pdf_canvas.setFont("Helvetica", 9)

        pdf_canvas.showPage()
        pdf_canvas.save()
        response.write(buffer.getvalue())
        buffer.close()
        return response
