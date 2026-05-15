from __future__ import annotations

import django.db.models.deletion
import django.utils.timezone
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0008_notification_kinds_leave_decisions"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="notification",
            name="kind",
            field=models.CharField(
                choices=[
                    ("request_submitted", "Data Request Submitted"),
                    ("leave_submitted", "Leave Request Submitted"),
                    ("leave_approved", "Leave Request Approved"),
                    ("leave_rejected", "Leave Request Rejected"),
                    ("salary_processed", "Salary Processed — Approval Needed"),
                    ("salary_acknowledged", "Salary Receipt Acknowledged"),
                ],
                max_length=50,
            ),
        ),
        migrations.CreateModel(
            name="Transaction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("flow", models.CharField(choices=[("income", "Income"), ("expense", "Expense")], max_length=10)),
                (
                    "category",
                    models.CharField(
                        choices=[
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
                        ],
                        max_length=30,
                    ),
                ),
                ("amount", models.DecimalField(decimal_places=2, max_digits=14)),
                ("currency", models.CharField(default="INR", max_length=8)),
                ("description", models.CharField(blank=True, max_length=255)),
                ("note", models.TextField(blank=True)),
                ("occurred_on", models.DateField(default=django.utils.timezone.localdate)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True, null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="finance_transactions_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        blank=True, null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="finance_transactions",
                        to="core.project",
                    ),
                ),
            ],
            options={
                "ordering": ["-occurred_on", "-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="transaction",
            index=models.Index(fields=["flow", "occurred_on"], name="fin_flow_date_idx"),
        ),
        migrations.AddIndex(
            model_name="transaction",
            index=models.Index(fields=["category", "occurred_on"], name="fin_cat_date_idx"),
        ),
        migrations.AddIndex(
            model_name="transaction",
            index=models.Index(fields=["project", "occurred_on"], name="fin_project_date_idx"),
        ),
        migrations.CreateModel(
            name="MiscExpense",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("spent_for", models.CharField(help_text="What was the money spent on?", max_length=255)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=14)),
                ("note", models.TextField(blank=True)),
                ("occurred_on", models.DateField(default=django.utils.timezone.localdate)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True, null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="misc_expenses_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "transaction",
                    models.OneToOneField(
                        blank=True, null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="misc_expense",
                        to="core.transaction",
                    ),
                ),
            ],
            options={
                "ordering": ["-occurred_on", "-created_at"],
            },
        ),
        migrations.CreateModel(
            name="SalaryPayment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("amount", models.DecimalField(decimal_places=2, max_digits=14)),
                ("period_month", models.PositiveSmallIntegerField(blank=True, null=True, help_text="1-12, the month this salary covers")),
                ("period_year", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("note", models.TextField(blank=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("processed", "Processed"),
                            ("approved", "Approved by Employee"),
                            ("rejected", "Rejected by Employee"),
                        ],
                        default="processed",
                        max_length=20,
                    ),
                ),
                ("employee_response_at", models.DateTimeField(blank=True, null=True)),
                ("employee_response_note", models.TextField(blank=True)),
                ("processed_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "employee",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="salary_payments",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "processed_by",
                    models.ForeignKey(
                        blank=True, null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="salary_payments_processed",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "transaction",
                    models.OneToOneField(
                        blank=True, null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="salary_payment",
                        to="core.transaction",
                    ),
                ),
            ],
            options={
                "ordering": ["-processed_at"],
            },
        ),
        migrations.AddIndex(
            model_name="salarypayment",
            index=models.Index(fields=["employee", "status"], name="fin_salary_emp_status_idx"),
        ),
        migrations.CreateModel(
            name="ProjectBudget",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("planned_amount", models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=14)),
                ("currency", models.CharField(default="INR", max_length=8)),
                ("note", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True, null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="project_budgets_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "project",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="budget",
                        to="core.project",
                    ),
                ),
            ],
        ),
    ]
