from __future__ import annotations

from decimal import Decimal

from django.db import models

from .user_models import Client, User


class Lead(models.Model):
    SOURCE_CHOICES = [
        ("whatsapp", "WhatsApp"),
        ("instagram", "Instagram"),
        ("facebook", "Facebook"),
        ("linkedin", "LinkedIn"),
        ("email", "Email"),
        ("phone", "Phone Call"),
        ("website", "Website"),
        ("other", "Other"),
    ]

    LEAD_TYPE_CHOICES = [
        ("ad", "Advertisement"),
        ("social_media", "Social Media"),
        ("personal_reference", "Personal Reference"),
        ("employee_referral", "Employee Referral"),
        ("cold_outreach", "Cold Outreach"),
        ("event", "Event / Conference"),
        ("inbound", "Inbound Inquiry"),
        ("other", "Other"),
    ]

    WORK_TYPE_CHOICES = [
        ("app", "Mobile App"),
        ("web", "Web Development"),
        ("design", "Design / Branding"),
        ("marketing", "Marketing"),
        ("data", "Data / Analytics"),
        ("consulting", "Consulting"),
        ("other", "Other"),
    ]

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("in_discussion", "In Discussion"),
        ("ongoing", "Ongoing"),
        ("converted", "Converted"),
        ("cancelled", "Cancelled"),
        ("rejected", "Rejected"),
    ]

    INVOICE_STATUS_CHOICES = [
        ("none", "Not Generated"),
        ("draft", "Draft"),
        ("sent", "Sent"),
        ("paid", "Paid"),
        ("overdue", "Overdue"),
    ]

    date = models.DateField(help_text="Date the lead was received")
    name = models.CharField(max_length=200)
    contact_details = models.CharField(max_length=255, blank=True, help_text="Phone, email, or both")

    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default="other")
    lead_type = models.CharField(max_length=30, choices=LEAD_TYPE_CHOICES, default="other")
    work_type = models.CharField(max_length=20, choices=WORK_TYPE_CHOICES, default="other")
    enquiry_video_link = models.URLField(blank=True)

    requirements = models.TextField(blank=True)
    remarks = models.TextField(blank=True)
    suggestion = models.TextField(blank=True)
    reason_not_proceed = models.TextField(blank=True)

    assigned_to = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="crm_leads"
    )
    referred_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="referred_leads",
        help_text="Set when lead_type='employee_referral' — the employee who referred this lead.",
    )
    last_followed_up = models.DateField(null=True, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    status_description = models.TextField(blank=True, help_text="Detailed notes about the current status")

    invoice_status = models.CharField(max_length=20, choices=INVOICE_STATUS_CHOICES, default="none")
    invoice_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00")
    )
    invoice_date = models.DateField(null=True, blank=True)
    invoice_notes = models.TextField(blank=True)
    invoice_file_url = models.URLField(blank=True, help_text="Optional link to an uploaded invoice file")

    # Captured during the lead stage so we can auto-create a Client record
    # the moment the lead is marked "converted". `client_name` defaults to
    # `name` if left blank.
    client_name = models.CharField(max_length=200, blank=True)
    client_domain = models.CharField(max_length=100, blank=True)
    client_contact_email = models.EmailField(blank=True)
    client_admin_name = models.CharField(max_length=200, blank=True)
    client_admin_email = models.EmailField(blank=True)
    # Set once the lead is converted -- prevents duplicate Client creation if
    # the status is toggled back and forth.
    client = models.ForeignKey(
        Client, null=True, blank=True, on_delete=models.SET_NULL, related_name="source_leads"
    )

    created_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_leads"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        indexes = [
            models.Index(fields=["status"], name="lead_status_idx"),
            models.Index(fields=["date"], name="lead_date_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.get_status_display()})"
