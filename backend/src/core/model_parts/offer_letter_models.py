from __future__ import annotations

from django.db import models

from .user_models import User


class OfferLetter(models.Model):
    """One record per offer-letter email sent.

    Snapshots the recipient's email/name at send time so the history page
    stays meaningful even if the User row is later renamed or deleted.
    """
    STATUS_CHOICES = [
        ("sent", "Sent"),
        ("failed", "Failed"),
    ]

    recipient = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="received_offers"
    )
    recipient_email_snapshot = models.EmailField(blank=True)
    recipient_name_snapshot = models.CharField(max_length=200, blank=True)

    subject = models.CharField(max_length=255)
    body = models.TextField()
    # Structured offer-letter content the PDF was rendered from. Snapshotted so
    # the history stays meaningful and the letter can be re-rendered.
    content = models.JSONField(default=dict, blank=True)
    # The generated 3-page Axinor PDF. System-produced, not user-uploaded.
    attachment = models.FileField(upload_to="offer_letters/%Y/%m/%d/", blank=True)

    sent_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="sent_offers"
    )
    sent_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="sent")
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ["-sent_at"]
        indexes = [
            models.Index(fields=["recipient", "sent_at"], name="offer_recipient_sent_idx"),
            models.Index(fields=["status", "sent_at"], name="offer_status_sent_idx"),
        ]

    def __str__(self) -> str:
        return f"Offer #{self.id} → {self.recipient_email_snapshot or '?'} ({self.status})"
