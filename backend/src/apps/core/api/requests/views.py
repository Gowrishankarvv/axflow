from __future__ import annotations

import io
import zipfile
from decimal import Decimal

from django.http import HttpResponse
from django.db import transaction
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.filters import OrderingFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from tables import DataRequest, ProjectAssignment, RequestFile, Task, TaskAssignment
from core.serializers import DataRequestSerializer
from core.utils import analyze_request_file


class DataRequestViewSet(viewsets.ModelViewSet):
    serializer_class = DataRequestSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["project", "status"]
    ordering_fields = ["created_at", "updated_at"]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "client_list"

    def get_queryset(self):
        user = self.request.user
        base_qs = DataRequest.objects.select_related(
            "project",
            "requester",
            "approved_by",
            "estimated_by",
            "task",
        ).prefetch_related("files")

        if user.is_superuser or user.role in ("superuser", "manager"):
            return base_qs.order_by("-created_at")
        if user.role == "employee":
            projects = ProjectAssignment.objects.filter(assignee=user).values_list("project_id", flat=True)
            return base_qs.filter(project_id__in=projects).order_by("-created_at")
        if getattr(user, "role", None) == "client":
            if user.client_org:
                return base_qs.filter(project__client=user.client_org).order_by("-created_at")
            return DataRequest.objects.none()
        return DataRequest.objects.none()

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        if getattr(request.user, "role", None) == "client":
            response["Cache-Control"] = "private, max-age=30, stale-while-revalidate=60"
        return response

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == "client" and "project" in serializer.validated_data:
            project = serializer.validated_data["project"]
            if project.client != user.client_org:
                raise PermissionDenied("You can only create requests for your own projects.")

        instance = serializer.save(requester=user)
        files = self.request.FILES.getlist("files")

        total_outlet_count = 0
        total_image_count = 0
        total_estimated_cost = Decimal("0.00")

        if instance.file:
            try:
                with instance.file.open("rb") as file_obj:
                    stats = analyze_request_file(file_obj)
                total_outlet_count += stats.get("outlet_count", 0)
                total_image_count += stats.get("image_count", 0)
                total_estimated_cost += stats.get("estimated_cost", Decimal("0.00"))
            except Exception as exc:
                print(f"Analysis failed for primary file: {exc}")

        for file_obj in files:
            request_file = RequestFile.objects.create(request=instance, file=file_obj)
            try:
                with request_file.file.open("rb") as opened:
                    stats = analyze_request_file(opened)
                total_outlet_count += stats.get("outlet_count", 0)
                total_image_count += stats.get("image_count", 0)
                total_estimated_cost += stats.get("estimated_cost", Decimal("0.00"))
            except Exception as exc:
                print(f"Analysis failed for file {file_obj.name}: {exc}")

        instance.analysis_outlet_count = total_outlet_count
        instance.analysis_image_count = total_image_count
        instance.auto_estimated_cost_inr = total_estimated_cost
        instance.save(update_fields=["analysis_outlet_count", "analysis_image_count", "auto_estimated_cost_inr"])

    @action(detail=True, methods=["get"], url_path="download_all")
    def download_all(self, request, pk=None):
        instance = self.get_object()

        files_to_zip = []
        if instance.file:
            files_to_zip.append(("main_" + instance.file.name.split("/")[-1], instance.file))
        for file_obj in instance.files.all():
            files_to_zip.append((file_obj.file.name.split("/")[-1], file_obj.file))

        if not files_to_zip:
            return Response({"detail": "No files found."}, status=404)

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for filename, field in files_to_zip:
                try:
                    with field.open("rb") as opened:
                        zip_file.writestr(filename, opened.read())
                except Exception as exc:
                    print(f"Error zipping file {filename}: {exc}")

        zip_buffer.seek(0)
        filename = f"Request_{instance.id}_Files.zip"
        response = HttpResponse(zip_buffer, content_type="application/zip")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    @action(detail=True, methods=["post"], url_path="estimate")
    def estimate(self, request, pk=None):
        instance = self.get_object()
        user = request.user
        if user.role == "client":
            return Response({"detail": "Clients cannot estimate requests."}, status=403)

        cost = request.data.get("estimated_cost")
        notes = request.data.get("estimation_notes", "")
        if not cost:
            return Response({"detail": "estimated_cost is required"}, status=400)

        instance.estimated_cost = cost
        instance.estimation_notes = notes
        instance.estimated_by = user
        instance.estimated_at = timezone.now()
        instance.status = "pending_approval"
        instance.save()
        return Response(self.get_serializer(instance).data)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        instance = self.get_object()
        user = request.user
        if user.role != "client" and not user.is_superuser:
            return Response({"detail": "Only clients can approve requests."}, status=403)
        if instance.status != "pending_approval":
            return Response({"detail": "Request is not pending approval."}, status=400)

        with transaction.atomic():
            instance.status = "approved"
            instance.approved_by = user
            instance.approved_at = timezone.now()

            task = Task.objects.create(
                project=instance.project,
                title=f"Request: {instance.title or 'Untitled'} ({instance.id})",
                description=f"{instance.description}\n\nEstimate: {instance.estimated_cost}\nLink: /media/{instance.file.name if instance.file else ''}",
                created_by=user,
                status="todo",
            )
            instance.task = task
            instance.save()

            project_assignees = ProjectAssignment.objects.filter(project=instance.project).values_list("assignee", flat=True)
            TaskAssignment.objects.bulk_create(
                [TaskAssignment(task=task, assignee_id=user_id, assigned_by=user) for user_id in project_assignees]
            )

        return Response(self.get_serializer(instance).data)
