from __future__ import annotations

import os
from typing import Any

from django.db.models import QuerySet
from django.utils import timezone

from apps.slack.client import post_message, update_message
from apps.slack.models import SlackTaskMessage, SlackUserThread
from tables import Task, User


DEFAULT_CHANNEL_ENV = "SLACK_TASK_TRACKER_CHANNEL_ID"


def _task_blocks(task: Task) -> list[dict[str, Any]]:
    return [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*{task.title}*\\nStatus: `{task.status}`\\nProject: {task.project.name}",
            },
        },
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Mark Done"},
                    "style": "primary",
                    "action_id": "task_done",
                    "value": str(task.id),
                }
            ],
        },
    ]


def _parent_text(user: User) -> str:
    name = user.get_full_name().strip() or user.username
    return f":shark: shark-tracker | Task thread for *{name}* (`{user.email}`)"


def _task_text(task: Task) -> str:
    return f"- [{task.status}] {task.title} ({task.project.name})"


def _open_tasks_for_user(user: User) -> QuerySet[Task]:
    return (
        Task.objects.filter(assignees=user)
        .exclude(status="done")
        .select_related("project", "created_by")
        .order_by("due_date", "id")
    )


def _ensure_parent_thread(user: User, channel_id: str) -> SlackUserThread:
    existing = SlackUserThread.objects.filter(user=user, is_active=True).first()
    parent_text = _parent_text(user)
    if existing:
        update_message(existing.channel_id, existing.parent_ts, parent_text)
        return existing

    resp = post_message(channel_id, parent_text)
    ts = str(resp.get("ts", ""))
    if not ts:
        raise RuntimeError("Slack did not return parent ts")
    return SlackUserThread.objects.create(
        user=user,
        channel_id=channel_id,
        parent_ts=ts,
        is_active=True,
    )


def _sync_user_task_replies(user_thread: SlackUserThread, tasks: list[Task]) -> dict[str, int]:
    created = 0
    updated = 0
    completed = 0

    active_task_ids = {task.id for task in tasks}
    existing_msgs = {m.task_id: m for m in SlackTaskMessage.objects.filter(user_thread=user_thread)}

    for task in tasks:
        text = _task_text(task)
        blocks = _task_blocks(task)
        existing = existing_msgs.get(task.id)
        if existing:
            update_message(user_thread.channel_id, existing.message_ts, text, blocks=blocks)
            if not existing.is_active:
                existing.is_active = True
                existing.save(update_fields=["is_active", "updated_at"])
            updated += 1
            continue

        resp = post_message(user_thread.channel_id, text, thread_ts=user_thread.parent_ts, blocks=blocks)
        msg_ts = str(resp.get("ts", ""))
        if not msg_ts:
            raise RuntimeError(f"Slack did not return reply ts for task {task.id}")
        SlackTaskMessage.objects.create(task=task, user_thread=user_thread, message_ts=msg_ts, is_active=True)
        created += 1

    for task_id, existing in existing_msgs.items():
        if task_id in active_task_ids or not existing.is_active:
            continue
        update_message(
            user_thread.channel_id,
            existing.message_ts,
            f":white_check_mark: Task completed or removed from queue (task_id={task_id})",
        )
        existing.is_active = False
        existing.save(update_fields=["is_active", "updated_at"])
        completed += 1

    user_thread.last_synced_at = timezone.now()
    user_thread.save(update_fields=["last_synced_at"])
    return {"created": created, "updated": updated, "completed": completed}


def sync_task_tracker(*, channel_id: str | None = None, user_ids: list[int] | None = None) -> dict[str, Any]:
    channel = channel_id or os.environ.get(DEFAULT_CHANNEL_ENV, "")
    if not channel:
        raise RuntimeError("SLACK_TASK_TRACKER_CHANNEL_ID is required")

    users_qs = User.objects.filter(is_active=True).exclude(role="client")
    if user_ids:
        users_qs = users_qs.filter(id__in=user_ids)

    totals = {
        "users_processed": 0,
        "threads_created": 0,
        "replies_created": 0,
        "replies_updated": 0,
        "replies_completed": 0,
    }

    for user in users_qs:
        had_thread = SlackUserThread.objects.filter(user=user, is_active=True).exists()
        user_thread = _ensure_parent_thread(user, channel)
        if not had_thread:
            totals["threads_created"] += 1

        tasks = list(_open_tasks_for_user(user))
        stats = _sync_user_task_replies(user_thread, tasks)
        totals["users_processed"] += 1
        totals["replies_created"] += stats["created"]
        totals["replies_updated"] += stats["updated"]
        totals["replies_completed"] += stats["completed"]

    return totals


def mark_task_done_from_interaction(task_id: int) -> Task:
    task = Task.objects.select_related("project").get(id=task_id)
    if task.status != "done":
        task.status = "done"
        task.save(update_fields=["status"])

    msg = SlackTaskMessage.objects.filter(task=task).select_related("user_thread").first()
    if msg:
        update_message(msg.user_thread.channel_id, msg.message_ts, f":white_check_mark: {task.title} ({task.project.name})")
        if msg.is_active:
            msg.is_active = False
            msg.save(update_fields=["is_active", "updated_at"])
    return task

