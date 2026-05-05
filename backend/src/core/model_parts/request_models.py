from django.db import models

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
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="invoices")
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="invoices", null=True, blank=True)
    file = models.FileField(upload_to="invoices/%Y/%m/")
    billing_period = models.DateField(help_text="First day of the billing month")
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Invoice {self.billing_period} - {self.client.name}"
