from __future__ import annotations

from datetime import date, timedelta
from typing import cast

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework import viewsets

from tables import Client, DataRequest, User
from core.permissions import IsManager
from core.serializers import ClientSerializer


class ClientViewSet(viewsets.ModelViewSet):
    serializer_class = ClientSerializer
    permission_classes = [IsManager]
    queryset = Client.objects.all().order_by("-created_at")


class ClientDashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "client_list"

    def get(self, request):
        user = cast(User, request.user)
        if getattr(user, "role", None) != "client":
            return Response({"detail": "Forbidden"}, status=403)
        if not getattr(user, "client_org", None):
            return Response({"status_counts": {}, "image_counts": {}, "recent_requests": []})

        try:
            month = int(request.query_params.get("month", ""))
            year = int(request.query_params.get("year", ""))
        except Exception:
            month = None
            year = None

        if month is None or month < 0 or month > 11:
            month = timezone.now().month - 1
        if year is None or year < 2000 or year > 2100:
            year = timezone.now().year

        start = date(year, month + 1, 1)
        if month == 11:
            end = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end = date(year, month + 2, 1) - timedelta(days=1)

        qs = (
            DataRequest.objects.filter(project__client=user.client_org, created_at__date__range=(start, end))
            .only("id", "title", "description", "status", "created_at", "analysis_image_count")
            .order_by("-created_at")
        )

        status_counts = {k: 0 for k, _ in DataRequest.STATUS_CHOICES}
        image_counts = {"review": 0, "todo": 0, "in_progress": 0, "completed": 0}

        for request_obj in qs[:200]:
            status_counts[request_obj.status] = status_counts.get(request_obj.status, 0) + 1
            image_count = int(request_obj.analysis_image_count or 0)
            if image_count > 0:
                if request_obj.status in ("pending_review", "pending_approval", "rejected"):
                    image_counts["review"] += image_count
                elif request_obj.status == "approved":
                    image_counts["todo"] += image_count
                elif request_obj.status == "in_progress":
                    image_counts["in_progress"] += image_count
                elif request_obj.status == "completed":
                    image_counts["completed"] += image_count

        recent_requests = [
            {
                "id": request_obj.id,
                "title": request_obj.title,
                "description": request_obj.description,
                "status": request_obj.status,
                "created_at": request_obj.created_at.isoformat() if request_obj.created_at else None,
                "analysis_image_count": request_obj.analysis_image_count or 0,
            }
            for request_obj in qs[:5]
        ]

        response = Response(
            {
                "range": {"month": month, "year": year, "start": start.isoformat(), "end": end.isoformat()},
                "status_counts": status_counts,
                "image_counts": image_counts,
                "recent_requests": recent_requests,
            }
        )
        response["Cache-Control"] = "private, max-age=30, stale-while-revalidate=60"
        return response
