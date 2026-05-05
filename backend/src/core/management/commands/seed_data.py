from __future__ import annotations

import json
import os
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from tables import Project, Task, TimeEntry, User


class Command(BaseCommand):
    help = "Seed data from JSON (core/fixtures/seed_data.json by default)"

    def add_arguments(self, parser):
        default_file = Path(__file__).resolve().parents[2] / "fixtures" / "seed_data.json"
        parser.add_argument("--file", default=str(default_file), help="Path to seed JSON file")

    @transaction.atomic
    def handle(self, *args, **options):
        data = json.loads(Path(options["file"]).read_text(encoding="utf-8"))
        password = os.environ.get("SEED_USER_PASSWORD", "ChangeMe123!")

        users_by_email: dict[str, User] = {}
        users_by_name: dict[str, User] = {}
        for u in data.get("users", []):
            user = User.objects.filter(email=u["email"]).first()
            if not user:
                user = User.objects.create_user(
                    username=u["email"],
                    email=u["email"],
                    password=password,
                    first_name=u["name"],
                    role=u["role"],
                    position=u.get("position", ""),
                )
            users_by_email[user.email] = user
            users_by_name[u["name"]] = user

        for u in data.get("users", []):
            if u.get("manager"):
                user = users_by_email[u["email"]]
                user.manager = users_by_name[u["manager"]]
                user.save(update_fields=["manager"])

        projects_by_name: dict[str, Project] = {}
        for p in data.get("projects", []):
            creator = users_by_email.get(p.get("created_by_email", "")) or next(iter(users_by_email.values()), None)
            project, _ = Project.objects.update_or_create(
                name=p["name"],
                defaults={"description": p.get("description", ""), "created_by": creator},
            )
            projects_by_name[project.name] = project

        tasks_by_key: dict[tuple[str, str], Task] = {}
        for t in data.get("tasks", []):
            task, _ = Task.objects.update_or_create(
                project=projects_by_name[t["project"]],
                title=t["title"],
                defaults={
                    "description": t.get("description", ""),
                    "created_by": users_by_email.get(t.get("created_by_email", "")),
                    "status": t.get("status", "todo"),
                },
            )
            task.assignees.set([users_by_email[email] for email in t.get("assignees", []) if email in users_by_email])
            tasks_by_key[(t["project"], t["title"])] = task

        visible_default = list(users_by_email.values())
        created_entries = 0
        for e in data.get("time_entries", []):
            start = parse_datetime(e["start_datetime"])
            end = parse_datetime(e["end_datetime"])
            if start is None or end is None:
                continue
            if timezone.is_naive(start):
                start = timezone.make_aware(start)
            if timezone.is_naive(end):
                end = timezone.make_aware(end)
            task = None
            if e.get("task_title"):
                task = tasks_by_key.get((e["project"], e["task_title"]))
            entry, created = TimeEntry.objects.get_or_create(
                user=users_by_email[e["user_email"]],
                project=projects_by_name[e["project"]],
                start_datetime=start,
                end_datetime=end,
                defaults={
                    "task": task,
                    "duration": end - start,
                    "description": e.get("description", ""),
                    "billable": bool(e.get("billable", False)),
                },
            )
            if not created:
                entry.task = task
                entry.duration = end - start
                entry.description = e.get("description", "")
                entry.billable = bool(e.get("billable", False))
                entry.save(update_fields=["task", "duration", "description", "billable"])
            visible = [users_by_email[email] for email in e.get("visible_to", []) if email in users_by_email] or visible_default
            entry.visible_to.set(visible)
            created_entries += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded users={len(data.get('users', []))}, projects={len(projects_by_name)}, "
                f"tasks={len(tasks_by_key)}, time_entries={created_entries}"
            )
        )
