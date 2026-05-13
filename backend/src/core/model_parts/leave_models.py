from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import models

from .user_models import User


class LeaveRequest(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("cancelled", "Cancelled"),
    ]
    LEAVE_TYPE_CHOICES = [
        ("casual", "Casual"),
        ("medical", "Medical"),
        ("emergency", "Emergency"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="leave_requests")
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")

    # Set at approval time; null/blank until then.
    leave_type = models.CharField(max_length=20, choices=LEAVE_TYPE_CHOICES, blank=True, default="")
    is_salary_cut = models.BooleanField(null=True, blank=True)
    approval_note = models.TextField(blank=True, help_text="Optional note from the approver")

    # Set at rejection time.
    rejection_reason = models.TextField(blank=True)

    decided_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="decided_leaves"
    )
    decided_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "start_date"], name="leave_user_start_idx"),
            models.Index(fields=["status", "start_date"], name="leave_status_start_idx"),
        ]

    def clean(self):
        super().clean()
        if self.end_date and self.start_date and self.end_date < self.start_date:
            raise ValidationError("end_date must be on or after start_date")

    @property
    def total_days(self) -> int:
        if not self.start_date or not self.end_date:
            return 0
        return (self.end_date - self.start_date).days + 1

    def __str__(self) -> str:
        return f"Leave {self.id} for {self.user_id}: {self.start_date}→{self.end_date} ({self.status})"
