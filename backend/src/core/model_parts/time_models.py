from __future__ import annotations

from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import models

from .user_models import User
from .work_models import Project, Task


class TimeEntry(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    task = models.ForeignKey("Task", on_delete=models.SET_NULL, null=True, blank=True)
    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()
    duration = models.DurationField()
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    visible_to = models.ManyToManyField(User, related_name="visible_entries", blank=True)
    billable = models.BooleanField(default=False)
    billing_rate = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    created_by_snapshot = models.CharField(max_length=200, blank=True, help_text="Snapshot of creator name for deleted users")
    is_idle = models.BooleanField(default=False, help_text="Marked as idle time")
    location = models.CharField(max_length=200, blank=True, help_text="Geographic location")
    locked = models.BooleanField(default=False)
    memory_source = models.CharField(max_length=50, blank=True, help_text="Source of automatic tracking")
    state = models.CharField(
        max_length=20,
        choices=[("draft", "Draft"), ("submitted", "Submitted"), ("approved", "Approved"), ("rejected", "Rejected")],
        default="draft",
    )
    manager_comment = models.TextField(blank=True, help_text="Manager comment on this time entry")
    manager_comment_at = models.DateTimeField(null=True, blank=True, help_text="When the manager comment was added")
    manager_comment_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="commented_entries",
        help_text="Manager who added the comment",
    )
    tags = models.ManyToManyField("Tag", related_name="time_entries", blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "start_datetime"], name="timeentry_user_start_idx"),
            models.Index(fields=["project", "start_datetime"], name="timeentry_project_start_idx"),
            models.Index(fields=["start_datetime", "end_datetime"], name="timeentry_start_end_idx"),
            models.Index(fields=["state", "start_datetime"], name="timeentry_state_start_idx"),
        ]


class ActiveTimeEntry(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="active_time_entry")
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    task = models.ForeignKey("Task", on_delete=models.SET_NULL, null=True, blank=True)
    start_datetime = models.DateTimeField()
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-start_datetime"]

    def __str__(self) -> str:
        project_name = getattr(self.project, "name", "Unknown Project")
        return f"{self.user_id}:{project_name}@{self.start_datetime.isoformat()}"


class Comment(models.Model):
    time_entry = models.ForeignKey(TimeEntry, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(User, on_delete=models.CASCADE)
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def clean(self):
        super().clean()
        if self.end_datetime and self.start_datetime and self.end_datetime <= self.start_datetime:
            raise ValidationError("end_datetime must be greater than start_datetime")

    def save(self, *args, **kwargs):
        if self.end_datetime and self.start_datetime:
            self.duration = self.end_datetime - self.start_datetime
        return super().save(*args, **kwargs)


class Tag(models.Model):
    CATEGORY_CHOICES = [
        ("phase", "Phase"),
        ("task", "Task"),
        ("system", "System"),
    ]

    name = models.CharField(max_length=100)
    emoji = models.CharField(max_length=10, blank=True)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default="task")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["category", "name"]

    def __str__(self):
        return f"{self.emoji} {self.name}"


class ClockSession(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    clock_in_time = models.DateTimeField()
    clock_out_time = models.DateTimeField(null=True, blank=True)
    duration = models.DurationField(null=True, blank=True)
    date = models.DateField()
    # One lunch break per session. Both fields null = no break taken yet.
    # start set, end null = currently on break. Both set = break finished.
    lunch_start_time = models.DateTimeField(null=True, blank=True)
    lunch_end_time = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-clock_in_time"]
        indexes = [
            models.Index(fields=["user", "clock_in_time"], name="clocksession_user_time_idx"),
            models.Index(fields=["date"], name="clocksession_date_idx"),
        ]

    def clean(self):
        super().clean()
        if self.clock_out_time and self.clock_out_time <= self.clock_in_time:
            raise ValidationError("clock_out_time must be greater than clock_in_time")
        if self.lunch_end_time and not self.lunch_start_time:
            raise ValidationError("lunch_end_time set without lunch_start_time")
        if self.lunch_start_time and self.clock_in_time and self.lunch_start_time < self.clock_in_time:
            raise ValidationError("lunch_start_time must be on or after clock_in_time")
        if self.lunch_end_time and self.lunch_start_time and self.lunch_end_time <= self.lunch_start_time:
            raise ValidationError("lunch_end_time must be greater than lunch_start_time")
        if self.clock_out_time and self.lunch_end_time and self.lunch_end_time > self.clock_out_time:
            raise ValidationError("lunch_end_time cannot be after clock_out_time")

    def save(self, *args, **kwargs):
        if not self.date:
            self.date = self.clock_in_time.date()
        if self.clock_out_time and self.clock_in_time:
            self.duration = self.clock_out_time - self.clock_in_time
        return super().save(*args, **kwargs)

    @property
    def lunch_duration(self):
        """Duration of the (completed) lunch break, or None if not finished."""
        if self.lunch_start_time and self.lunch_end_time:
            return self.lunch_end_time - self.lunch_start_time
        return None

    @property
    def worked_duration(self):
        """Net worked duration = gross duration minus lunch break."""
        if not self.duration:
            return None
        ld = self.lunch_duration
        return (self.duration - ld) if ld else self.duration

    @classmethod
    def get_active_session(cls, user):
        return cls.objects.filter(user=user, clock_out_time__isnull=True).first()


class DailySummary(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="daily_summaries")
    date = models.DateField()
    total_duration = models.DurationField(default=timedelta(0))

    class Meta:
        unique_together = ("user", "date")
        indexes = [
            models.Index(fields=["user", "date"], name="dailysummary_user_date_idx"),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.date}: {self.total_duration}"
