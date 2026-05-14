from __future__ import annotations

from django.db import models

from .user_models import User


class Ticket(models.Model):
    KIND_CHOICES = [
        ("bug", "Bug"),
        ("feature", "Feature Request"),
    ]
    STATUS_CHOICES = [
        ("open", "Open"),
        ("in_progress", "In Progress"),
        ("resolved", "Resolved"),
        ("closed", "Closed"),
    ]

    kind = models.CharField(max_length=10, choices=KIND_CHOICES, default="bug")
    title = models.CharField(max_length=200)
    description = models.TextField()
    attachment = models.FileField(upload_to="tickets/%Y/%m/", null=True, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="open")
    # Set by a manager when they update status. Visible to the submitter.
    resolution_note = models.TextField(blank=True)
    resolved_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="resolved_tickets",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="raised_tickets"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "created_at"], name="ticket_status_created_idx"),
            models.Index(fields=["created_by", "status"], name="ticket_by_status_idx"),
        ]

    def __str__(self) -> str:
        return f"[{self.get_kind_display()}] {self.title}"
