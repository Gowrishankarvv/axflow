from __future__ import annotations

from django.db import models

from .user_models import User
from .work_models import Project


class ProjectCredential(models.Model):
    """Plain-text credential storage scoped to a single project.

    Visibility/edit is gated to managers+superusers at the view layer. Stored
    plain so callers can read it back -- if encryption is ever needed, swap
    `secret` to an encrypted field type without changing the API shape.
    """

    KIND_CHOICES = [
        ("google", "Google"),
        ("github", "GitHub"),
        ("aws", "AWS"),
        ("cdn", "CDN"),
        ("database", "Database"),
        ("ftp", "FTP / SSH"),
        ("smtp", "SMTP / Email"),
        ("dlt", "DLT"),
        ("api_key", "API Key"),
        ("other", "Other"),
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="credentials")
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default="other")
    # Only used when kind == "other" -- free-text label for the type.
    kind_custom = models.CharField(max_length=80, blank=True)

    label = models.CharField(max_length=200, help_text="Human-readable name e.g. 'Production AWS'")
    username = models.CharField(max_length=255, blank=True, help_text="Username, email, account ID, etc.")
    # Plain text by deliberate choice. Anyone with DB access can read it.
    secret = models.TextField(blank=True, help_text="Password, API key, or token")
    url = models.URLField(blank=True, help_text="Login URL or dashboard")
    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_credentials"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["project", "kind"], name="cred_project_kind_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.label} ({self.kind})"
