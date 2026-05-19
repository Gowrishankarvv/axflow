from django.db import models
from django.utils import timezone

from .user_models import Client, User
from .work_models import Project, Task


class DataRequest(models.Model):
    STATUS_CHOICES = [
        ("pending_review", "Pending Review"),
        ("pending_approval", "Pending Approval"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("in_progress", "In Progress"),
        ("completed", "Completed"),
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="data_requests")
    requester = models.ForeignKey(User, on_delete=models.CASCADE, related_name="requested_data")
    title = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    file = models.FileField(upload_to="requests/%Y/%m/%d/")

    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="pending_review")

    estimated_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    estimation_notes = models.TextField(blank=True)
    estimated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="estimated_requests")
    estimated_at = models.DateTimeField(null=True, blank=True)

    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="approved_requests")

    task = models.OneToOneField(Task, on_delete=models.SET_NULL, null=True, blank=True, related_name="origin_request")

    analysis_outlet_count = models.IntegerField(null=True, blank=True)
    analysis_image_count = models.IntegerField(null=True, blank=True)
    auto_estimated_cost_inr = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Request {self.id}: {self.title or 'Untitled'}"


class RequestFile(models.Model):
    request = models.ForeignKey(DataRequest, on_delete=models.CASCADE, related_name="files")
    file = models.FileField(upload_to="requests/%Y/%m/%d/")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"File for {self.request_id}: {self.file.name}"


class Invoice(models.Model):
    """A billable invoice raised to a client.

    Lifecycle: ``requested`` (issued by exec/superuser) → ``paid`` (client
    marks it after paying) → ``completed`` (exec/superuser confirms; this
    posts a project-tagged income Transaction). The PDF is system-generated.
    """

    STATUS_CHOICES = [
        ("requested", "Payment Requested"),
        ("paid", "Marked Paid by Client"),
        ("completed", "Payment Completed"),
    ]

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="invoices")
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="invoices", null=True, blank=True)

    invoice_number = models.CharField(max_length=32, unique=True, blank=True)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="requested")
    currency = models.CharField(max_length=8, default="INR")
    notes = models.TextField(blank=True)

    issue_date = models.DateField(default=timezone.localdate)
    due_date = models.DateField(null=True, blank=True)
    # Legacy / optional — kept so old rows and the month filter still work.
    billing_period = models.DateField(null=True, blank=True, help_text="First day of the billing month")

    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    file = models.FileField(upload_to="invoices/%Y/%m/", null=True, blank=True)
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="invoices_created")

    paid_marked_at = models.DateTimeField(null=True, blank=True)
    paid_marked_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="invoices_marked_paid",
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="invoices_completed",
    )
    transaction = models.OneToOneField(
        "core.Transaction", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="invoice",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.invoice_number or 'Invoice'} - {self.client.name} ({self.status})"

    def recalc_totals(self) -> None:
        """Recompute subtotal/total from line items."""
        agg = sum((i.amount for i in self.items.all()), models.DecimalField().to_python(0))
        self.subtotal = agg
        self.total = agg

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            # Year-scoped sequential number, e.g. INV-2026-0007.
            year = (self.issue_date or timezone.localdate()).year
            last = (
                Invoice.objects.filter(invoice_number__startswith=f"INV-{year}-")
                .order_by("-invoice_number")
                .first()
            )
            seq = 1
            if last and last.invoice_number:
                try:
                    seq = int(last.invoice_number.split("-")[-1]) + 1
                except (ValueError, IndexError):
                    seq = 1
            self.invoice_number = f"INV-{year}-{seq:04d}"
        super().save(*args, **kwargs)


class InvoiceItem(models.Model):
    """A single billable line on an invoice. ``amount`` = quantity × rate."""

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="items")
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=1)
    rate = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        ordering = ["id"]

    def save(self, *args, **kwargs):
        self.amount = (self.quantity or 0) * (self.rate or 0)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.description} ({self.amount})"
