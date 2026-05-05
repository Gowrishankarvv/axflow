from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


def validate_email_domain(email: str):
    allowed = getattr(settings, "ALLOWED_EMAIL_DOMAINS", [])
    if allowed:
        domain = email.split("@")[-1].lower() if "@" in email else ""
        if domain not in [d.strip().lower() for d in allowed]:
            raise ValidationError(f"Email domain must be one of: {', '.join(allowed)}")


class User(AbstractUser):
    email = models.EmailField(unique=True)
    manager = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="direct_reports")
    role = models.CharField(
        choices=[("superuser", "Superuser"), ("manager", "Manager"), ("employee", "Employee"), ("client", "Client")],
        max_length=20,
    )
    client_org = models.ForeignKey("Client", null=True, blank=True, on_delete=models.SET_NULL)
    must_set_password = models.BooleanField(default=False)
    position = models.CharField(max_length=200, blank=True, default="")
    monthly_threshold_hours = models.DecimalField(
        max_digits=8, decimal_places=2, default=Decimal("0.00"), help_text="Monthly hour limit for this user"
    )
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    def clean(self):
        super().clean()
        if self.email and self.role != "client":
            validate_email_domain(self.email)

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class Client(models.Model):
    name = models.CharField(max_length=200)
    domain = models.CharField(max_length=100, blank=True, help_text="Domain for auto-verification if permitted")
    contact_email = models.EmailField(blank=True)
    logo = models.ImageField(upload_to="client_logos/", null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class OrganizationUnit(models.Model):
    name = models.CharField(max_length=200)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL)

    def __str__(self) -> str:
        return self.name
