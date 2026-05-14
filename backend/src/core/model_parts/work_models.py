from __future__ import annotations

from decimal import Decimal

from django.db import models

from .user_models import Client, User


class Project(models.Model):
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    client = models.ForeignKey(Client, on_delete=models.SET_NULL, null=True, blank=True, related_name="projects")
    created_at = models.DateTimeField(auto_now_add=True)
    # Optional planning/actual timeline fields
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    monthly_threshold_hours = models.DecimalField(
        max_digits=8, decimal_places=2, default=Decimal("0"), help_text="Monthly hour limit for this project"
    )
    billable = models.BooleanField(default=False)

    def __str__(self) -> str:
        return self.name


class ProjectAssignment(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    assignee = models.ForeignKey(User, on_delete=models.CASCADE)
    assigned_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="+")
    allotted_hours = models.DecimalField(max_digits=7, decimal_places=2, default=Decimal("0"))
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)

    class Meta:
        unique_together = ("project", "assignee")


class TaskAssignment(models.Model):
    task = models.ForeignKey("Task", on_delete=models.CASCADE)
    assignee = models.ForeignKey(User, on_delete=models.CASCADE)
    assigned_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="+")
    allotted_hours = models.DecimalField(max_digits=7, decimal_places=2, default=Decimal("0"))
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)

    class Meta:
        unique_together = ("task", "assignee")


class Task(models.Model):
    STATUS_CHOICES = [
        ("todo", "To Do"),
        ("pending", "Pending"),
        ("in_progress", "In Progress"),
        ("done", "Done"),
    ]
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="tasks")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    assignees = models.ManyToManyField(
        User, through="TaskAssignment", through_fields=("task", "assignee"), related_name="task_assignments"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="todo")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="created_tasks")
    created_at = models.DateTimeField(auto_now_add=True)
    # Detailed date planning fields (all optional)
    actual_start_date = models.DateField(null=True, blank=True)
    planned_start_date = models.DateField(null=True, blank=True)
    planned_end_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    # Tracks the dates we already sent reminders for, so the daily cron
    # never double-notifies if it runs more than once on the same day.
    start_reminder_sent_for = models.DateField(null=True, blank=True, editable=False)
    due_reminder_sent_for = models.DateField(null=True, blank=True, editable=False)

    class Meta:
        indexes = [
            models.Index(fields=["project", "status"], name="task_project_status_idx"),
            models.Index(fields=["due_date"], name="task_due_date_idx"),
        ]

    def __str__(self) -> str:
        return self.title
