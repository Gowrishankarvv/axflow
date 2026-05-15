from __future__ import annotations

from django.db import models
from django.utils import timezone

from .user_models import User


class EmployeeSalary(models.Model):
    """Salary configuration per employee, with full revision history.

    Each row is one revision. The *current* salary for an employee is the most
    recent row (by `effective_from`, then `created_at`) whose `effective_from`
    is on or before today. Finance's salary-payment flow looks this up to
    prefill — and lock — the amount it disburses.
    """

    employee = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="salary_revisions",
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=8, default="INR")
    effective_from = models.DateField(default=timezone.localdate)
    note = models.CharField(max_length=255, blank=True)

    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="employee_salaries_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-effective_from", "-created_at"]
        indexes = [
            models.Index(fields=["employee", "effective_from"], name="emp_salary_emp_eff_idx"),
        ]

    def __str__(self) -> str:
        return f"Salary {self.amount} for {self.employee_id} (from {self.effective_from})"

    @classmethod
    def current_for(cls, employee_id: int, on_date=None):
        """Return the active EmployeeSalary row for an employee on the given
        date (defaults to today), or None if no salary is configured yet."""
        on_date = on_date or timezone.localdate()
        return (
            cls.objects
            .filter(employee_id=employee_id, effective_from__lte=on_date)
            .order_by("-effective_from", "-created_at")
            .first()
        )
