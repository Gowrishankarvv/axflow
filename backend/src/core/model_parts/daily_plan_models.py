from __future__ import annotations

from django.db import models
from django.utils import timezone

from .user_models import User
from .work_models import Project, Task


class DailyPlanItem(models.Model):
    """One thing an employee plans to complete *today* on an assigned task.

    Items are day-scoped: they can only be created/edited for the current
    date. Each item is tied to a project task the employee is assigned to.
    Hours worked against an item are normal TimeEntry rows pointing back here
    via TimeEntry.plan_item, and each of those carries its own done flag.
    """

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="daily_plan_items",
    )
    plan_date = models.DateField(default=timezone.localdate, db_index=True)
    task = models.ForeignKey(
        Task, on_delete=models.CASCADE, related_name="daily_plan_items",
    )
    # Denormalised from task.project so plan lists filter/serialize cheaply.
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="daily_plan_items",
    )
    description = models.CharField(max_length=500)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["user", "plan_date"], name="dailyplan_user_date_idx"),
        ]

    def save(self, *args, **kwargs):
        if self.task_id and not self.project_id:
            self.project_id = self.task.project_id
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.user_id} {self.plan_date}: {self.description[:40]}"
