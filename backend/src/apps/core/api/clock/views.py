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
        now = timezone.now()
        # If user clocks out while still on lunch, end the break at clock-out time.
        if active.lunch_start_time and not active.lunch_end_time:
            active.lunch_end_time = now
        active.clock_out_time = now
        active.save()
        serializer = self.get_serializer(active)
        return Response(serializer.data)

    @action(detail=False, methods=["post"], url_path="start_lunch")
    def start_lunch(self, request):
        user = cast(User, request.user)
        active = ClockSession.get_active_session(user)
        if not active:
            return Response({"detail": "Not clocked in"}, status=400)
        if active.lunch_start_time and not active.lunch_end_time:
            return Response({"detail": "Lunch break already in progress"}, status=400)
        if active.lunch_start_time and active.lunch_end_time:
            return Response({"detail": "Lunch break already taken for this session"}, status=400)
        active.lunch_start_time = timezone.now()
        active.save()
        serializer = self.get_serializer(active)
        return Response(serializer.data)

    @action(detail=False, methods=["post"], url_path="end_lunch")
    def end_lunch(self, request):
        user = cast(User, request.user)
        active = ClockSession.get_active_session(user)
        if not active:
            return Response({"detail": "Not clocked in"}, status=400)
        if not active.lunch_start_time:
            return Response({"detail": "Lunch break not started"}, status=400)
        if active.lunch_end_time:
            return Response({"detail": "Lunch break already ended"}, status=400)
        active.lunch_end_time = timezone.now()
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

    @action(detail=False, methods=["get"], url_path="worked_summary")
    def worked_summary(self, request):
        """Daily worked hours from ClockSession (gross duration minus lunch).

        Returns the same shape as /reports/summary/ so the dashboard can swap
        data sources transparently:  [{"date": "YYYY-MM-DD", "hours": float}]

        For sessions still in progress (no clock_out_time), worked time is
        computed up to "now" so the Today card reflects real-time progress.
        Same for an in-progress lunch break — the unfinished lunch is treated
        as if it ends "now" until the user clicks End Lunch.
        """
        user = cast(User, request.user)
        qs = ClockSession.objects.all()

        # Visibility — mirror get_queryset()
        if not (user.is_superuser or user.role == "superuser"):
            visible_user_ids = build_visible_user_ids(user)
            qs = qs.filter(user_id__in=visible_user_ids)

        qp_user_id = request.query_params.get("user_id")
        if qp_user_id == "me":
            qs = qs.filter(user_id=user.id)
        elif qp_user_id:
            qs = qs.filter(user_id=qp_user_id)

        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        if start_date:
            qs = qs.filter(date__gte=start_date)
        if end_date:
            qs = qs.filter(date__lte=end_date)

        now = timezone.now()
        daily: dict[str, float] = {}
        for session in qs.only(
            "date", "clock_in_time", "clock_out_time",
            "lunch_start_time", "lunch_end_time",
        ):
            date_key = session.date.isoformat()
            end = session.clock_out_time or now
            gross = (end - session.clock_in_time).total_seconds()
            lunch_secs = 0.0
            if session.lunch_start_time:
                lunch_end = session.lunch_end_time or now
                lunch_secs = (lunch_end - session.lunch_start_time).total_seconds()
            net = max(0.0, gross - lunch_secs)
            daily[date_key] = daily.get(date_key, 0.0) + net

        result = [{"date": d, "hours": round(secs / 3600, 2)} for d, secs in sorted(daily.items())]
        return Response(result)
