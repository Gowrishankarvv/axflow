from __future__ import annotations

from django.db import models

from .user_models import User
from .work_models import Task


class TaskExtensionRequest(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    ]

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="extension_requests")
    requester = models.ForeignKey(User, on_delete=models.CASCADE, related_name="extension_requests")
    # Snapshot of the task's due_date at submission time -- so the approver
    # can see what was being extended even if it changes later.
    current_due_date = models.DateField(null=True, blank=True)
    requested_due_date = models.DateField()
    reason = models.TextField(blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    decided_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="decided_extension_requests",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "created_at"], name="ext_status_created_idx"),
            models.Index(fields=["task", "status"], name="ext_task_status_idx"),
        ]

    def __str__(self) -> str:
        return f"Extension #{self.id} for task {self.task_id} ({self.status})"
