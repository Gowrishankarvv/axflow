from __future__ import annotations

from decimal import Decimal

from django.db import models
from django.utils import timezone

from .user_models import User
from .work_models import Project


# ---------------------------------------------------------------------------
# Category catalogue
# ---------------------------------------------------------------------------
# All finance entries flow through a single Transaction model. Each
# transaction has a flow (income / expense) and a category. The 11 categories
# the product spec asked for are encoded below.

TRANSACTION_FLOW_CHOICES = [
    ("income", "Income"),
    ("expense", "Expense"),
]

TRANSACTION_CATEGORY_CHOICES = [
    ("expense", "Expense"),
    ("income", "Income"),
    ("misc", "Miscellaneous Expense"),
    ("server", "Server Cost"),
    ("api", "API Cost"),
    ("salary", "Salary"),
    ("tools", "Tools Cost"),
    ("ta", "TA (Travel Allowance)"),
    ("client_meeting", "Client Meeting"),
    ("rent", "Rent"),
    ("food", "Food"),
]


class Transaction(models.Model):
    """Single ledger entry — every income or expense lives here.

    The Finance overview computes the balance by summing income rows and
    subtracting expense rows. Specialised flows (Salary, MiscExpense) create
    rows here too so the balance stays consistent regardless of how the
    money moved.
    """

    flow = models.CharField(max_length=10, choices=TRANSACTION_FLOW_CHOICES)
    category = models.CharField(max_length=30, choices=TRANSACTION_CATEGORY_CHOICES)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=8, default="INR")
    description = models.CharField(max_length=255, blank=True)
    note = models.TextField(blank=True)

    occurred_on = models.DateField(default=timezone.localdate)
    project = models.ForeignKey(
        Project, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="finance_transactions",
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="finance_transactions_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-occurred_on", "-created_at"]
        indexes = [
            models.Index(fields=["flow", "occurred_on"], name="fin_flow_date_idx"),
            models.Index(fields=["category", "occurred_on"], name="fin_cat_date_idx"),
            models.Index(fields=["project", "occurred_on"], name="fin_project_date_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.flow}:{self.category} {self.amount} {self.currency}"


class MiscExpense(models.Model):
    """Detailed miscellaneous expense. Mirrors into Transaction on save so the
    balance reflects it."""

    spent_for = models.CharField(max_length=255, help_text="What was the money spent on?")
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    note = models.TextField(blank=True)
    occurred_on = models.DateField(default=timezone.localdate)

    transaction = models.OneToOneField(
        Transaction, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="misc_expense",
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="misc_expenses_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-occurred_on", "-created_at"]

    def __str__(self) -> str:
        return f"Misc: {self.spent_for} ({self.amount})"


class SalaryPayment(models.Model):
    """A salary disbursement to an employee.

    Workflow:
    1. Finance/exec creates a SalaryPayment for an employee.
    2. Status starts as 'processed'. A Notification is dropped into the
       employee's inbox asking them to approve once the money is credited.
    3. Employee clicks "Approve" → status moves to 'approved'.
    """

    STATUS_CHOICES = [
        ("processed", "Processed"),
        ("approved", "Approved by Employee"),
        ("rejected", "Rejected by Employee"),
    ]

    employee = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="salary_payments",
    )
    # `amount` is the *net* paid out (gross minus any salary cut). The ledger
    # mirrors this field, so the Finance balance always reflects money that
    # actually left the account.
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    # Configured monthly salary before the leave-based cut, kept for the
    # payslip breakdown.
    gross_amount = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True,
    )
    salary_cut = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0"),
    )
    salary_cut_days = models.PositiveSmallIntegerField(default=0)
    period_month = models.PositiveSmallIntegerField(
        null=True, blank=True, help_text="1-12, the month this salary covers",
    )
    period_year = models.PositiveSmallIntegerField(null=True, blank=True)
    note = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="processed")

    employee_response_at = models.DateTimeField(null=True, blank=True)
    employee_response_note = models.TextField(blank=True)

    processed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="salary_payments_processed",
    )
    processed_at = models.DateTimeField(default=timezone.now)

    transaction = models.OneToOneField(
        Transaction, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="salary_payment",
    )

    class Meta:
        ordering = ["-processed_at"]
        indexes = [
            models.Index(fields=["employee", "status"], name="fin_salary_emp_status_idx"),
        ]

    def __str__(self) -> str:
        return f"Salary {self.amount} → {self.employee_id} ({self.status})"


class ProjectBudget(models.Model):
    """Budget envelope for a single project. Actual spend is the sum of
    Transactions tagged to this project."""

    project = models.OneToOneField(
        Project, on_delete=models.CASCADE, related_name="budget",
    )
    planned_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    currency = models.CharField(max_length=8, default="INR")
    note = models.TextField(blank=True)

    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="project_budgets_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Budget for {self.project_id}: {self.planned_amount} {self.currency}"


# ---------------------------------------------------------------------------
# Internal / External project expenses
# ---------------------------------------------------------------------------
# A project's spend is split into two scopes: "internal" (infra/tooling the
# company pays for) and "external" (food, meetings, externally-hired help).
# Each scope has a catalogue of expense types. The catalogue ships with a few
# built-in types and execs can add their own; custom types are global per
# scope so they're reusable across every project.

EXPENSE_SCOPE_CHOICES = [
    ("internal", "Internal"),
    ("external", "External"),
]


class ExpenseType(models.Model):
    """A reusable expense category, scoped to internal or external. Built-in
    rows are seeded by migration; everything else is exec-created and shared
    across all projects within its scope."""

    scope = models.CharField(max_length=10, choices=EXPENSE_SCOPE_CHOICES)
    name = models.CharField(max_length=80)
    # Built-ins can't be deleted from the catalogue.
    is_builtin = models.BooleanField(default=False)
    # When true the expense entry should also capture the external person's
    # name and role (used by the "External Employee" type).
    requires_person = models.BooleanField(default=False)

    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="expense_types_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("scope", "name")
        ordering = ["scope", "name"]

    def __str__(self) -> str:
        return f"{self.scope}:{self.name}"


class ProjectExpense(models.Model):
    """A single actual expense recorded against a project, classified by
    scope + expense type. Mirrors into Transaction so the Finance balance and
    the project's actual-spend stay consistent."""

    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="budget_expenses",
    )
    scope = models.CharField(max_length=10, choices=EXPENSE_SCOPE_CHOICES)
    expense_type = models.ForeignKey(
        ExpenseType, on_delete=models.PROTECT, related_name="expenses",
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    note = models.CharField(max_length=255, blank=True)

    # Only populated when expense_type.requires_person (external hire).
    person_name = models.CharField(max_length=120, blank=True)
    person_role = models.CharField(max_length=120, blank=True)

    occurred_on = models.DateField(default=timezone.localdate)

    transaction = models.OneToOneField(
        Transaction, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="project_expense",
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="project_expenses_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-occurred_on", "-created_at"]
        indexes = [
            models.Index(fields=["project", "scope"], name="fin_pexp_proj_scope_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.scope} {self.amount} ({self.project_id})"
