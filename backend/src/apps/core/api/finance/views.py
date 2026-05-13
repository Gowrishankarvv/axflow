from __future__ import annotations

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsExecutive


class FinanceSummaryView(APIView):
    """Placeholder Finance summary, gated to executives + superusers.

    The numbers are currently zeros — this endpoint exists to prove out the
    access-control wiring. Wire it to real Invoice / Expense / Payroll models
    when those land.
    """
    permission_classes = [IsAuthenticated, IsExecutive]

    def get(self, request):
        return Response({
            "currency": "INR",
            "revenue_this_month": 0,
            "expenses_this_month": 0,
            "net_profit_this_month": 0,
            "outstanding_invoices_count": 0,
            "outstanding_invoices_total": 0,
            "payroll_due_this_month": 0,
            "recent_transactions": [],
            "note": "Sample data only. Replace with real aggregates from invoices / expenses / payroll.",
        })
