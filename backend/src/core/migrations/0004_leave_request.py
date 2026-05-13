from __future__ import annotations

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0003_clocksession_lunch_break"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="LeaveRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("start_date", models.DateField()),
                ("end_date", models.DateField()),
                ("reason", models.TextField()),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("approved", "Approved"),
                            ("rejected", "Rejected"),
                            ("cancelled", "Cancelled"),
                        ],
                        default="pending",
                        max_length=20,
                    ),
                ),
                (
                    "leave_type",
                    models.CharField(
                        blank=True,
                        choices=[("casual", "Casual"), ("medical", "Medical"), ("emergency", "Emergency")],
                        default="",
                        max_length=20,
                    ),
                ),
                ("is_salary_cut", models.BooleanField(blank=True, null=True)),
                ("approval_note", models.TextField(blank=True, help_text="Optional note from the approver")),
                ("rejection_reason", models.TextField(blank=True)),
                ("decided_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="leave_requests",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "decided_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="decided_leaves",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="leaverequest",
            index=models.Index(fields=["user", "start_date"], name="leave_user_start_idx"),
        ),
        migrations.AddIndex(
            model_name="leaverequest",
            index=models.Index(fields=["status", "start_date"], name="leave_status_start_idx"),
        ),
    ]
