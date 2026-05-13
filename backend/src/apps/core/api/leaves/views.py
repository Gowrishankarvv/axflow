from __future__ import annotations

from calendar import monthrange
from collections import defaultdict
from datetime import date
from typing import cast

from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.selectors import build_visible_user_ids
from core.models import LeaveRequest
from core.serializers import LeaveRequestSerializer
from tables import User


def _is_manager_or_super(user) -> bool:
    return bool(user.is_superuser or getattr(user, "role", "") in ("manager", "superuser"))


class LeaveRequestViewSet(viewsets.ModelViewSet):
    """Leave application + approval workflow.

    - Employees POST to /api/leaves/ to submit. They see only their own leaves.
    - Managers/superusers see leaves for their visible-users tree, and can
      approve/reject via the dedicated actions.
    """
    serializer_class = LeaveRequestSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["status", "user", "leave_type"]
    ordering_fields = ["created_at", "start_date", "end_date"]

    def get_queryset(self):
        user = cast(User, self.request.user)
        qs = LeaveRequest.objects.select_related("user", "decided_by").all()

        if _is_manager_or_super(user):
            if not (user.is_superuser or getattr(user, "role", "") == "superuser"):
                visible = build_visible_user_ids(user)
                qs = qs.filter(user_id__in=visible)
        else:
            qs = qs.filter(user_id=user.id)

        qp_user_id = self.request.query_params.get("user_id")
        if qp_user_id == "me":
            qs = qs.filter(user_id=user.id)
        elif qp_user_id:
            qs = qs.filter(user_id=qp_user_id)

        return qs

    def perform_create(self, serializer):
        # Anchor to the requesting user; clients can't forge "user" in the body.
        serializer.save(user=self.request.user, status="pending")

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        user = cast(User, request.user)
        if not _is_manager_or_super(user):
            return Response({"detail": "Forbidden"}, status=403)
        leave = self._get_leave(pk)
        if not leave:
            return Response({"detail": "Not found"}, status=404)
        if leave.status != "pending":
            return Response({"detail": f"Cannot approve a {leave.status} leave"}, status=400)

        leave_type = (request.data.get("leave_type") or "").strip()
        if leave_type not in {"casual", "medical", "emergency"}:
            return Response({"detail": "leave_type must be casual, medical, or emergency"}, status=400)
        is_salary_cut = request.data.get("is_salary_cut")
        if is_salary_cut is None:
            return Response({"detail": "is_salary_cut is required"}, status=400)
        approval_note = (request.data.get("approval_note") or "").strip()

        leave.leave_type = leave_type
        leave.is_salary_cut = bool(is_salary_cut)
        leave.approval_note = approval_note
        leave.status = "approved"
        leave.decided_by = user
        leave.decided_at = timezone.now()
        leave.save()
        return Response(self.get_serializer(leave).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        user = cast(User, request.user)
        if not _is_manager_or_super(user):
            return Response({"detail": "Forbidden"}, status=403)
        leave = self._get_leave(pk)
        if not leave:
            return Response({"detail": "Not found"}, status=404)
        if leave.status != "pending":
            return Response({"detail": f"Cannot reject a {leave.status} leave"}, status=400)
        rejection_reason = (request.data.get("rejection_reason") or "").strip()
        if not rejection_reason:
            return Response({"detail": "rejection_reason is required"}, status=400)
        leave.status = "rejected"
        leave.rejection_reason = rejection_reason
        leave.decided_by = user
        leave.decided_at = timezone.now()
        leave.save()
        return Response(self.get_serializer(leave).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """A user can cancel their own pending leave."""
        user = cast(User, request.user)
        leave = self._get_leave(pk)
        if not leave:
            return Response({"detail": "Not found"}, status=404)
        if leave.user_id != user.id and not _is_manager_or_super(user):
            return Response({"detail": "Forbidden"}, status=403)
        if leave.status != "pending":
            return Response({"detail": f"Cannot cancel a {leave.status} leave"}, status=400)
        leave.status = "cancelled"
        leave.save()
        return Response(self.get_serializer(leave).data)

    @action(detail=False, methods=["get"], url_path="month_usage")
    def month_usage(self, request):
        """Approved leave days a user already used in a given calendar month.

        Used by the approval modal to suggest a salary-cut default. A leave spans
        a range; we intersect it with the month window.

        Query params: user_id (required), year, month
        """
        target_user_id = request.query_params.get("user_id")
        if not target_user_id:
            return Response({"detail": "user_id is required"}, status=400)
        try:
            year = int(request.query_params.get("year"))
            month = int(request.query_params.get("month"))
        except (TypeError, ValueError):
            return Response({"detail": "year and month are required integers"}, status=400)

        month_start = date(year, month, 1)
        month_end = date(year, month, monthrange(year, month)[1])
        # Any approved leave whose [start,end] overlaps [month_start, month_end]
        leaves = LeaveRequest.objects.filter(
            user_id=target_user_id, status="approved",
            start_date__lte=month_end, end_date__gte=month_start,
        )
        total_days = 0
        for leave in leaves:
            s = max(leave.start_date, month_start)
            e = min(leave.end_date, month_end)
            total_days += (e - s).days + 1

        return Response({
            "user_id": int(target_user_id),
            "year": year,
            "month": month,
            "approved_days_in_month": total_days,
            "free_quota": 1,
            "remaining_free": max(0, 1 - total_days),
        })

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """Stats per user. Employees can only request their own; managers/superusers any visible user."""
        user = cast(User, request.user)
        target = request.query_params.get("user_id")
        if not target or target == "me":
            target_user_id = user.id
        else:
            try:
                target_user_id = int(target)
            except ValueError:
                return Response({"detail": "user_id must be an integer or 'me'"}, status=400)

        if not _is_manager_or_super(user) and target_user_id != user.id:
            return Response({"detail": "Forbidden"}, status=403)

        qs = LeaveRequest.objects.filter(user_id=target_user_id)
        by_status: dict[str, int] = defaultdict(int)
        approved_days_by_type: dict[str, int] = defaultdict(int)
        salary_cut_days_total = 0
        salary_cut_leaves: list[dict] = []
        for leave in qs.order_by("-start_date"):
            by_status[leave.status] += 1
            if leave.status == "approved":
                if leave.leave_type:
                    approved_days_by_type[leave.leave_type] += leave.total_days
                if leave.is_salary_cut:
                    salary_cut_days_total += leave.total_days
                    salary_cut_leaves.append({
                        "id": leave.id,
                        "start_date": leave.start_date,
                        "end_date": leave.end_date,
                        "days": leave.total_days,
                        "leave_type": leave.leave_type,
                        "reason": leave.reason,
                    })

        return Response({
            "by_status": dict(by_status),
            "approved_days_by_type": dict(approved_days_by_type),
            "salary_cut_days_total": salary_cut_days_total,
            "salary_cut_leaves": salary_cut_leaves,
        })

    # --- helpers ---
    def _get_leave(self, pk):
        return LeaveRequest.objects.filter(pk=pk).first()
