"""Daily cron: notify each assignee on the day their task's start date or due
date arrives. Intended to be run once per day -- safe to run multiple times,
duplicate notifications are guarded by per-task `*_reminder_sent_for` columns.

Wire to system cron, e.g. 9am IST:

    30 3 * * *  cd /app && python manage.py send_task_reminders

(03:30 UTC = 09:00 IST)
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from core.notify_email import notify
from tables import Task


class Command(BaseCommand):
    help = "Send in-app + email reminders for tasks whose start_date or due_date is today."

    def add_arguments(self, parser):
        parser.add_argument(
            "--date",
            help="ISO date (YYYY-MM-DD) to run for. Defaults to today (server tz).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Log what would be sent without creating notifications.",
        )

    def handle(self, *args, **options):
        if options.get("date"):
            from datetime import date as _date
            today = _date.fromisoformat(options["date"])
        else:
            today = timezone.localdate()

        dry = options.get("dry_run", False)

        start_qs = (
            Task.objects
            .filter(planned_start_date=today)
            .exclude(start_reminder_sent_for=today)
            .exclude(status="done")
            .select_related("project")
            .prefetch_related("assignees")
        )

        due_qs = (
            Task.objects
            .filter(due_date=today)
            .exclude(due_reminder_sent_for=today)
            .exclude(status="done")
            .select_related("project")
            .prefetch_related("assignees")
        )

        sent_start = 0
        sent_due = 0

        for task in start_qs:
            assignees = list(task.assignees.all())
            if not assignees:
                # Still mark sent so we don't keep re-scanning an unassigned task.
                if not dry:
                    Task.objects.filter(pk=task.pk).update(start_reminder_sent_for=today)
                continue
            title = f"Task starts today: {task.title}"
            message = (
                f'Your task "{task.title}" in project "{task.project.name}" is scheduled '
                f"to start today ({today})."
            )
            if task.due_date:
                message += f" Due: {task.due_date}."
            for u in assignees:
                if dry:
                    self.stdout.write(f"  [dry] start -> {u.username} ({u.email})")
                else:
                    notify(
                        user=u, kind="task_start_today", title=title, message=message,
                        link=f"/projects/{task.project_id}",
                    )
                    sent_start += 1
            if not dry:
                Task.objects.filter(pk=task.pk).update(start_reminder_sent_for=today)

        for task in due_qs:
            assignees = list(task.assignees.all())
            if not assignees:
                if not dry:
                    Task.objects.filter(pk=task.pk).update(due_reminder_sent_for=today)
                continue
            title = f"Task due today: {task.title}"
            message = (
                f'Your task "{task.title}" in project "{task.project.name}" is due today ({today}). '
                f"Need more time? Submit an extension request from the Requests page."
            )
            for u in assignees:
                if dry:
                    self.stdout.write(f"  [dry] due -> {u.username} ({u.email})")
                else:
                    notify(
                        user=u, kind="task_due_today", title=title, message=message,
                        link=f"/projects/{task.project_id}",
                    )
                    sent_due += 1
            if not dry:
                Task.objects.filter(pk=task.pk).update(due_reminder_sent_for=today)

        self.stdout.write(self.style.SUCCESS(
            f"Reminders for {today}: start={sent_start}, due={sent_due}"
            + (" (dry-run)" if dry else "")
        ))
