from __future__ import annotations

from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.salary_cut import compute_salary_cut
from core.models import EmployeeSalary, User
from core.permissions import IsExecutive
from core.serializers import EmployeeSalarySerializer


def _cut_payload(amount, employee_id: int, year: int, month: int) -> dict:
    """JSON-safe salary-cut breakdown for an employee in one month."""
    b = compute_salary_cut(amount, employee_id, year, month)
    return {
        "year": b["year"],
        "month": b["month"],
        "days_in_month": b["days_in_month"],
        "salary_cut_days": b["salary_cut_days"],
        "per_day": float(b["per_day"]),
        "gross_amount": float(b["gross_amount"]),
        "salary_cut": float(b["salary_cut"]),
        "net_amount": float(b["net_amount"]),
    }


class EmployeeSalaryViewSet(viewsets.ModelViewSet):
    """Manages employee salary revisions.

    Each row is one revision (effective_from + amount). The viewset also
    exposes `roster/` — a flat list of all non-client users with their
    *current* salary attached — for the Salary module's main table.
    """

    permission_classes = [IsAuthenticated, IsExecutive]
    serializer_class = EmployeeSalarySerializer
    queryset = EmployeeSalary.objects.select_related("employee", "created_by").all()

    def get_queryset(self):
        qs = super().get_queryset()
        emp = self.request.query_params.get("employee")
        if emp:
            qs = qs.filter(employee_id=emp)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=["get"], url_path="current")
    def current(self, request):
        """Get the active salary for one employee. Query param: ?employee=<id>"""
        emp_id = request.query_params.get("employee")
        if not emp_id:
            return Response({"detail": "employee is required"}, status=400)
        sal = EmployeeSalary.current_for(emp_id)
        if not sal:
            return Response({"detail": "No salary configured for this employee.", "configured": False}, status=404)
        today = timezone.localdate()
        try:
            year = int(request.query_params.get("year") or today.year)
            month = int(request.query_params.get("month") or today.month)
        except (TypeError, ValueError):
            return Response({"detail": "year and month must be integers"}, status=400)
        return Response({
            "configured": True,
            **EmployeeSalarySerializer(sal).data,
            "salary_cut": _cut_payload(sal.amount, int(emp_id), year, month),
        })

    @action(detail=False, methods=["get"], url_path="roster")
    def roster(self, request):
        """Every non-client employee with their current salary (or null if not set yet)."""
        users = User.objects.filter(is_active=True).exclude(role="client").order_by("first_name", "username")
        today = timezone.localdate()
        rows = []
        for u in users:
            sal = EmployeeSalary.current_for(u.id)
            rows.append({
                "employee_id": u.id,
                "employee_name": (u.first_name or u.username),
                "email": u.email,
                "role": u.role,
                "position": u.position,
                "current_salary": EmployeeSalarySerializer(sal).data if sal else None,
                # Salary cut for the current month (None until a salary is set).
                "salary_cut": (
                    _cut_payload(sal.amount, u.id, today.year, today.month)
                    if sal else None
                ),
            })
        return Response(rows)
