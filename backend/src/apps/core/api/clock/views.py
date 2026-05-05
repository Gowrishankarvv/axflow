from __future__ import annotations

from typing import cast

from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.selectors import build_visible_user_ids
from tables import ClockSession, User
from core.serializers import ClockSessionSerializer


class ClockSessionViewSet(viewsets.ModelViewSet):
    serializer_class = ClockSessionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["user", "date"]
    ordering_fields = ["clock_in_time", "clock_out_time", "created_at"]

    def get_queryset(self):
        user = cast(User, self.request.user)
        qs = ClockSession.objects.select_related("user").all().order_by("-clock_in_time")
        qp_user_id = self.request.query_params.get("user_id")
        start_date = self.request.query_params.get("start_date")
        end_date = self.request.query_params.get("end_date")

        if not (user.is_superuser or user.role == "superuser"):
            visible_user_ids = build_visible_user_ids(user)
            qs = qs.filter(user_id__in=visible_user_ids)
        if qp_user_id:
            if qp_user_id == "me":
                qs = qs.filter(user_id=user.id)
            else:
                qs = qs.filter(user_id=qp_user_id)
        if start_date:
            qs = qs.filter(date__gte=start_date)
        if end_date:
            qs = qs.filter(date__lte=end_date)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=["post"])
    def clock_in(self, request):
        user = cast(User, request.user)
        active = ClockSession.get_active_session(user)
        if active:
            return Response({"detail": "Already clocked in"}, status=400)
        session = ClockSession.objects.create(user=user, clock_in_time=timezone.now())
        serializer = self.get_serializer(session)
        return Response(serializer.data, status=201)

    @action(detail=False, methods=["post"])
    def clock_out(self, request):
        user = cast(User, request.user)
        active = ClockSession.get_active_session(user)
        if not active:
            return Response({"detail": "Not clocked in"}, status=400)
        active.clock_out_time = timezone.now()
        active.save()
        serializer = self.get_serializer(active)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="my_active")
    def my_active(self, request):
        user = cast(User, request.user)
        active = ClockSession.get_active_session(user)
        if not active:
            return Response(None)
        serializer = self.get_serializer(active)
        return Response(serializer.data)
