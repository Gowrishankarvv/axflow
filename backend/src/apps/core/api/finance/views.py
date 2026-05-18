from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import cast

from django.db.models import Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import (
    EmployeeSalary,
    ExpenseType,
    MiscExpense,
    ProjectBudget,
    ProjectExpense,
    SalaryPayment,
    Transaction,
    User,
)
from core.permissions import IsExecutive
from core.serializers import (
    ExpenseTypeSerializer,
    MiscExpenseSerializer,
    ProjectBudgetSerializer,
    ProjectExpenseSerializer,
    SalaryPaymentSerializer,
    TransactionSerializer,
)


def _month_window(today: date | None = None) -> tuple[date, date]:
    today = today or timezone.localdate()
    start = today.replace(day=1)
    return start, today


class FinanceSummaryView(APIView):
    """Executive overview: balance, this-month income/expense, recent txns,
    category breakdown, and any pending salary acknowledgements."""
    permission_classes = [IsAuthenticated, IsExecutive]

    def get(self, request):
        month_start, today = _month_window()

        income_total = Transaction.objects.filter(flow="income").aggregate(
            s=Sum("amount"))["s"] or Decimal("0")
        expense_total = Transaction.objects.filter(flow="expense").aggregate(
            s=Sum("amount"))["s"] or Decimal("0")
        balance = income_total - expense_total

        income_month = Transaction.objects.filter(
            flow="income", occurred_on__gte=month_start,
        ).aggregate(s=Sum("amount"))["s"] or Decimal("0")
        expense_month = Transaction.objects.filter(
            flow="expense", occurred_on__gte=month_start,
        ).aggregate(s=Sum("amount"))["s"] or Decimal("0")

        category_breakdown = list(
            Transaction.objects.filter(
                flow="expense", occurred_on__gte=month_start,
            ).values("category").annotate(total=Sum("amount")).order_by("-total")
        )

        recent_qs = Transaction.objects.select_related("project", "created_by").all()[:10]
        recent_transactions = TransactionSerializer(recent_qs, many=True).data

        pending_salaries = SalaryPayment.objects.filter(status="processed").count()

        return Response({
            "currency": "INR",
            "balance": float(balance),
            "income_total": float(income_total),
            "expense_total": float(expense_total),
            "income_this_month": float(income_month),
            "expense_this_month": float(expense_month),
            "net_this_month": float(income_month - expense_month),
            "category_breakdown_this_month": [
                {"category": row["category"], "total": float(row["total"])}
                for row in category_breakdown
            ],
            "recent_transactions": recent_transactions,
            "pending_salary_approvals": pending_salaries,
        })


class TransactionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsExecutive]
    serializer_class = TransactionSerializer
    queryset = Transaction.objects.select_related("project", "created_by").all()

    def get_queryset(self):
        qs = super().get_queryset()
        flow = self.request.query_params.get("flow")
        category = self.request.query_params.get("category")
        project = self.request.query_params.get("project")
        if flow:
            qs = qs.filter(flow=flow)
        if category:
            qs = qs.filter(category=category)
        if project:
            qs = qs.filter(project_id=project)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class MiscExpenseViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsExecutive]
    serializer_class = MiscExpenseSerializer
    queryset = MiscExpense.objects.select_related("transaction", "created_by").all()

    def perform_create(self, serializer):
        misc = serializer.save(created_by=self.request.user)
        # Mirror into the ledger so the balance reflects this misc expense.
        txn = Transaction.objects.create(
            flow="expense",
            category="misc",
            amount=misc.amount,
            description=misc.spent_for,
            note=misc.note,
            occurred_on=misc.occurred_on,
            created_by=self.request.user,
        )
        misc.transaction = txn
        misc.save(update_fields=["transaction"])

    def perform_destroy(self, instance):
        if instance.transaction_id:
            instance.transaction.delete()
        instance.delete()


class SalaryPaymentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = SalaryPaymentSerializer
    queryset = SalaryPayment.objects.select_related(
        "employee", "processed_by", "transaction",
    ).all()

    def _is_exec(self, user) -> bool:
        return IsExecutive().has_permission(self.request, self)

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        # Employees only see their own. Execs see everything.
        if not self._is_exec(user):
            qs = qs.filter(employee_id=user.id)
        scope = self.request.query_params.get("scope")
        if scope == "mine":
            qs = qs.filter(employee_id=user.id)
        emp = self.request.query_params.get("employee")
        if emp:
            qs = qs.filter(employee_id=emp)
        return qs

    def create(self, request, *args, **kwargs):
        if not self._is_exec(request.user):
            return Response({"detail": "Forbidden"}, status=403)
        # Enforce that the amount equals the employee's currently-configured
        # salary. The frontend prefills + locks this field, but we also
        # validate server-side so a custom amount cannot be smuggled in.
        emp_id = request.data.get("employee")
        if not emp_id:
            return Response({"detail": "employee is required"}, status=400)
        configured = EmployeeSalary.current_for(emp_id)
        if not configured:
            return Response(
                {"detail": "No salary is configured for this employee. Set one in the Salary module first."},
                status=400,
            )
        # `amount`/`gross_amount`/`salary_cut` are read-only on the serializer
        # and computed server-side in perform_create — nothing to force here.
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        from apps.core.salary_cut import compute_salary_cut

        emp = serializer.validated_data["employee"]
        today = timezone.localdate()
        year = serializer.validated_data.get("period_year") or today.year
        month = serializer.validated_data.get("period_month") or today.month

        configured = EmployeeSalary.current_for(emp.id)
        breakdown = compute_salary_cut(configured.amount, emp.id, year, month)

        sal = serializer.save(
            processed_by=self.request.user,
            processed_at=timezone.now(),
            status="processed",
            amount=breakdown["net_amount"],
            gross_amount=breakdown["gross_amount"],
            salary_cut=breakdown["salary_cut"],
            salary_cut_days=breakdown["salary_cut_days"],
        )
        desc = f"Salary: {sal.employee.first_name or sal.employee.username}"
        if breakdown["salary_cut"]:
            desc += (
                f" (gross {breakdown['gross_amount']} − cut {breakdown['salary_cut']}"
                f" for {breakdown['salary_cut_days']} leave day(s))"
            )
        txn = Transaction.objects.create(
            flow="expense",
            category="salary",
            amount=sal.amount,
            description=desc,
            note=sal.note,
            occurred_on=timezone.localdate(),
            created_by=self.request.user,
        )
        sal.transaction = txn
        sal.save(update_fields=["transaction"])

    def update(self, request, *args, **kwargs):
        if not self._is_exec(request.user):
            return Response({"detail": "Forbidden"}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not self._is_exec(request.user):
            return Response({"detail": "Forbidden"}, status=403)
        instance = self.get_object()
        if instance.transaction_id:
            instance.transaction.delete()
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Employee confirms the salary has landed in their account."""
        sal = self.get_object()
        user = cast(User, request.user)
        if sal.employee_id != user.id:
            return Response({"detail": "Only the recipient can approve."}, status=403)
        if sal.status != "processed":
            return Response({"detail": f"Cannot approve a {sal.status} salary"}, status=400)
        sal.status = "approved"
        sal.employee_response_at = timezone.now()
        sal.employee_response_note = (request.data.get("note") or "").strip()
        sal.save()

        # Notify the processor that the employee acknowledged the salary.
        from core.models import Notification
        if sal.processed_by_id:
            Notification.objects.create(
                user=sal.processed_by,
                actor=user,
                kind="salary_acknowledged",
                title="Salary acknowledged",
                message=f"{user.first_name or user.username} confirmed receipt of their salary.",
                link="/finance",
            )
        return Response(self.get_serializer(sal).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """Employee flags the salary as not received / incorrect."""
        sal = self.get_object()
        user = cast(User, request.user)
        if sal.employee_id != user.id:
            return Response({"detail": "Only the recipient can reject."}, status=403)
        if sal.status != "processed":
            return Response({"detail": f"Cannot reject a {sal.status} salary"}, status=400)
        reason = (request.data.get("note") or "").strip()
        if not reason:
            return Response({"detail": "note (reason) is required"}, status=400)
        sal.status = "rejected"
        sal.employee_response_at = timezone.now()
        sal.employee_response_note = reason
        sal.save()
        return Response(self.get_serializer(sal).data)


class ProjectBudgetViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsExecutive]
    serializer_class = ProjectBudgetSerializer
    queryset = ProjectBudget.objects.select_related("project").all()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class ExpenseTypeViewSet(viewsets.ModelViewSet):
    """Global, per-scope catalogue of expense types. Built-ins are seeded and
    cannot be deleted; execs can add custom ones reusable across all projects."""

    permission_classes = [IsAuthenticated, IsExecutive]
    serializer_class = ExpenseTypeSerializer
    queryset = ExpenseType.objects.all()

    def get_queryset(self):
        qs = super().get_queryset()
        scope = self.request.query_params.get("scope")
        if scope:
            qs = qs.filter(scope=scope)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.is_builtin:
            return Response(
                {"detail": "Built-in expense types cannot be deleted."}, status=400,
            )
        if instance.expenses.exists():
            return Response(
                {"detail": "This type is in use by existing expenses."}, status=400,
            )
        return super().destroy(request, *args, **kwargs)


class ProjectExpenseViewSet(viewsets.ModelViewSet):
    """Actual internal/external expenses recorded against a project. Mirrors
    each entry into the ledger so the Finance balance and the project's
    actual-spend stay consistent."""

    permission_classes = [IsAuthenticated, IsExecutive]
    serializer_class = ProjectExpenseSerializer
    queryset = ProjectExpense.objects.select_related(
        "project", "expense_type", "created_by", "transaction",
    ).all()

    def get_queryset(self):
        qs = super().get_queryset()
        project = self.request.query_params.get("project")
        scope = self.request.query_params.get("scope")
        if project:
            qs = qs.filter(project_id=project)
        if scope:
            qs = qs.filter(scope=scope)
        return qs

    def perform_create(self, serializer):
        exp = serializer.save(created_by=self.request.user)
        type_name = exp.expense_type.name if exp.expense_type else "Expense"
        desc = f"{exp.get_scope_display()} · {type_name}"
        if exp.person_name:
            who = exp.person_name
            if exp.person_role:
                who += f" ({exp.person_role})"
            desc += f" — {who}"
        elif exp.note:
            desc += f" — {exp.note}"
        txn = Transaction.objects.create(
            flow="expense",
            category="misc",
            amount=exp.amount,
            description=desc[:255],
            note=exp.note,
            occurred_on=exp.occurred_on,
            project=exp.project,
            created_by=self.request.user,
        )
        exp.transaction = txn
        exp.save(update_fields=["transaction"])

    def perform_destroy(self, instance):
        if instance.transaction_id:
            instance.transaction.delete()
        instance.delete()
