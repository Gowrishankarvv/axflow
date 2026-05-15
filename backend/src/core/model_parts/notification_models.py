from __future__ import annotations

from django.db import models

from .user_models import User


class Notification(models.Model):
    """In-app notification fanned out to a single recipient.

    The model is intentionally generic — `kind` tags the event type and `link`
    points at the in-app path the UI should navigate to when the user clicks
    the notification. New event types are added by tagging a fresh `kind`
    string in the signal handler; no schema change required.
    """
    KIND_CHOICES = [
        ("request_submitted", "Data Request Submitted"),
        ("leave_submitted", "Leave Request Submitted"),
        ("leave_approved", "Leave Request Approved"),
        ("leave_rejected", "Leave Request Rejected"),
        ("salary_processed", "Salary Processed — Approval Needed"),
        ("salary_acknowledged", "Salary Receipt Acknowledged"),
        # Add more event kinds here as features grow:
        # ("offer_sent",      "Offer Letter Sent"),
        # ("task_assigned",   "Task Assigned"),
        ("task_assigned", "Task Assigned"),
        ("task_start_today", "Task Starts Today"),
        ("task_due_today", "Task Due Today"),
        ("extension_submitted", "Extension Request Submitted"),
        ("extension_approved", "Extension Request Approved"),
        ("extension_rejected", "Extension Request Rejected"),
    ]

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="notifications",
        help_text="Recipient of this notification.",
    )
    actor = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="triggered_notifications",
        help_text="User whose action triggered this notification (if any).",
    )
    kind = models.CharField(max_length=50, choices=KIND_CHOICES)
    title = models.CharField(max_length=200)
    message = models.TextField(blank=True)
    link = models.CharField(
        max_length=255, blank=True,
        help_text="In-app path to open on click, e.g. '/requests'",
    )
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_read", "created_at"], name="notif_user_read_idx"),
        ]

    def __str__(self) -> str:
        return f"Notification {self.id} → {self.user_id} ({self.kind})"
