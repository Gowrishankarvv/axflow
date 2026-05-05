from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from apps.slack.task_tracker.service import sync_task_tracker


class Command(BaseCommand):
    help = "Sync shark-tracker task threads/messages to Slack."

    def add_arguments(self, parser):
        parser.add_argument("--channel-id", dest="channel_id", default=None, help="Slack channel ID override")
        parser.add_argument(
            "--user-id",
            dest="user_ids",
            action="append",
            type=int,
            default=[],
            help="Filter sync to specific user id (repeatable)",
        )

    def handle(self, *args, **options):
        channel_id = options.get("channel_id")
        user_ids = options.get("user_ids") or None
        try:
            stats = sync_task_tracker(channel_id=channel_id, user_ids=user_ids)
        except Exception as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(self.style.SUCCESS(f"Task tracker sync complete: {stats}"))

