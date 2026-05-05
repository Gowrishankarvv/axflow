from __future__ import annotations

import logging
import os
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from django.db import close_old_connections
from django.utils import timezone

from apps.slack.client import SlackApiError, delete_message, lookup_user_id_by_email, post_message, update_message
from apps.slack.models import (
    SlackChannelEmailSubscription,
    SlackChannelRegistration,
    SlackStandupParent,
    SlackStandupTaskMessage,
)
from tables import Task, User

logger = logging.getLogger(__name__)
_executor = ThreadPoolExecutor(max_workers=int(os.environ.get("SLACK_STANDUP_WORKERS", "2")))
_running_channels: set[str] = set()
_running_lock = threading.Lock()


def _is_message_not_found(exc: Exception) -> bool:
    return "message_not_found" in str(exc)


def _task_blocks(task: Task) -> list[dict[str, Any]]:
    description = (task.description or "").strip() or "-"
    return [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"Task: {task.title}\nDescription: {description}",
            },
        },
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Resolve"},
                    "style": "primary",
                    "action_id": "standup_resolve",
                    "value": str(task.id),
                },
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Skip"},
                    "action_id": "standup_skip",
                    "value": str(task.id),
                },
            ],
        },
    ]


def _parent_text(slack_user_ref: str, email: str, task_count: int) -> str:
    first_line = (slack_user_ref or email).replace("✅", "").replace("☑️", "").replace("✔️", "").strip()
    return f"{first_line}\n{email}\nNo of tasks: {task_count}"


def _parent_blocks(task_count: int) -> list[dict[str, Any]] | None:
    if task_count > 0:
        return None
    return [
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Resolve"},
                    "style": "primary",
                    "action_id": "standup_parent_resolve",
                    "value": "resolve_parent",
                }
            ],
        }
    ]


def _normalize_slack_mention(raw: str) -> str:
    value = (raw or "").strip()
    if not value:
        return ""
    # Accept `<@U123>`, `<@U123|name>`, or plain `U123`.
    m = re.match(r"^<@([A-Z0-9]+)(?:\\|[^>]+)?>$", value)
    if m:
        return f"<@{m.group(1)}>"
    if re.match(r"^[A-Z0-9]{8,}$", value):
        return f"<@{value}>"
    return value


def _open_tasks_for_subscription(sub: SlackChannelEmailSubscription, user: User) -> list[Task]:
    project_ids = list(sub.project_subscriptions.values_list("project_id", flat=True))
    if not project_ids:
        return []
    return list(
        Task.objects.filter(assignees=user, project_id__in=project_ids)
        .exclude(status="done")
        .select_related("project")
        .order_by("due_date", "id")
    )


def _resolve_user(sub: SlackChannelEmailSubscription) -> User | None:
    if sub.app_user:
        return sub.app_user
    user = User.objects.filter(email__iexact=sub.email).first()
    if user and sub.app_user_id != user.id:
        sub.app_user = user
        sub.save(update_fields=["app_user", "updated_at"])
    return user


def _ensure_tagged_mention(sub: SlackChannelEmailSubscription) -> str:
    mention = _normalize_slack_mention(sub.slack_user_ref)
    if mention.startswith("<@") and mention.endswith(">"):
        if mention != sub.slack_user_ref:
            sub.slack_user_ref = mention
            sub.save(update_fields=["slack_user_ref", "updated_at"])
        return mention

    # If we only have plain text (e.g. "@name"), try resolving by email.
    try:
        slack_user_id = lookup_user_id_by_email(sub.email)
    except Exception:
        slack_user_id = None

    if slack_user_id:
        mention = f"<@{slack_user_id}>"
        if mention != sub.slack_user_ref:
            sub.slack_user_ref = mention
            sub.save(update_fields=["slack_user_ref", "updated_at"])
        return mention

    return mention


def _ensure_parent(channel: SlackChannelRegistration, sub: SlackChannelEmailSubscription, task_count: int) -> SlackStandupParent:
    parent = SlackStandupParent.objects.filter(channel=channel, email=sub.email).first()
    mention = _ensure_tagged_mention(sub)
    text = _parent_text(mention, sub.email, task_count)
    blocks = _parent_blocks(task_count)
    if parent:
        try:
            update_message(channel.channel_id, parent.parent_ts, text, blocks=blocks)
        except SlackApiError as exc:
            if not _is_message_not_found(exc):
                raise
            # Parent was deleted in Slack; recreate it and continue.
            posted = post_message(channel.channel_id, text, blocks=blocks)
            ts = str(posted.get("ts", ""))
            if not ts:
                raise RuntimeError(f"Failed to recreate parent thread for {sub.email}")
            parent.parent_ts = ts
            parent.save(update_fields=["parent_ts", "last_synced_at"])
        if parent.slack_user_ref != mention or parent.app_user_id != sub.app_user_id or not parent.is_active:
            parent.slack_user_ref = mention
            parent.app_user = sub.app_user
            parent.is_active = True
            parent.save(update_fields=["slack_user_ref", "app_user", "is_active", "last_synced_at"])
        return parent

    posted = post_message(channel.channel_id, text, blocks=blocks)
    ts = str(posted.get("ts", ""))
    if not ts:
        raise RuntimeError(f"Failed to create parent thread for {sub.email}")
    return SlackStandupParent.objects.create(
        channel=channel,
        email=sub.email,
        app_user=sub.app_user,
        slack_user_ref=mention,
        parent_ts=ts,
        is_active=True,
    )


def resolve_standup_parent(parent_id: int) -> None:
    parent = SlackStandupParent.objects.select_related("channel").get(id=parent_id)
    parent.is_active = False
    parent.save(update_fields=["is_active", "last_synced_at"])
    delete_message(parent.channel.channel_id, parent.parent_ts)


def sync_standup_for_channel(channel_id: str) -> dict[str, int]:
    channel = SlackChannelRegistration.objects.filter(channel_id=channel_id).first()
    if not channel:
        raise RuntimeError(f"Channel not registered: {channel_id}")

    subscriptions = list(
        channel.email_subscriptions.filter(is_active=True)
        .select_related("app_user")
        .prefetch_related("project_subscriptions")
    )
    stats = {"users": 0, "parents": 0, "tasks_created": 0, "tasks_updated": 0, "tasks_resolved": 0}

    for sub in subscriptions:
        user = _resolve_user(sub)
        tasks = _open_tasks_for_subscription(sub, user) if user else []
        parent_exists = SlackStandupParent.objects.filter(channel=channel, email=sub.email).exists()
        parent = _ensure_parent(channel, sub, len(tasks))
        if not parent_exists:
            stats["parents"] += 1

        existing = {m.task_id: m for m in parent.task_messages.all()}
        open_task_ids = {t.id for t in tasks}

        for task in tasks:
            text = f"Task: {task.title}"
            blocks = _task_blocks(task)
            msg = existing.get(task.id)
            if msg:
                try:
                    update_message(channel.channel_id, msg.message_ts, text, blocks=blocks)
                except SlackApiError as exc:
                    if not _is_message_not_found(exc):
                        raise
                    posted = post_message(channel.channel_id, text, thread_ts=parent.parent_ts, blocks=blocks)
                    msg_ts = str(posted.get("ts", ""))
                    if not msg_ts:
                        raise RuntimeError(f"Failed re-posting task reply for {sub.email}")
                    msg.message_ts = msg_ts
                    msg.is_active = True
                    msg.save(update_fields=["message_ts", "is_active", "updated_at"])
                if not msg.is_active:
                    msg.is_active = True
                    msg.save(update_fields=["is_active", "updated_at"])
                stats["tasks_updated"] += 1
                continue

            posted = post_message(channel.channel_id, text, thread_ts=parent.parent_ts, blocks=blocks)
            msg_ts = str(posted.get("ts", ""))
            if not msg_ts:
                raise RuntimeError(f"Failed posting task reply for {sub.email}")
            SlackStandupTaskMessage.objects.create(
                standup_parent=parent,
                task=task,
                message_ts=msg_ts,
                is_active=True,
            )
            stats["tasks_created"] += 1

        for task_id, msg in existing.items():
            if task_id in open_task_ids or not msg.is_active:
                continue
            try:
                update_message(
                    channel.channel_id,
                    msg.message_ts,
                    f"Task resolved: {msg.task.title}",
                    blocks=[{"type": "section", "text": {"type": "mrkdwn", "text": f"Task: {msg.task.title}\nStatus: `done`"}}],
                )
            except SlackApiError as exc:
                if not _is_message_not_found(exc):
                    raise
            msg.is_active = False
            msg.resolved_at = timezone.now()
            msg.save(update_fields=["is_active", "resolved_at", "updated_at"])
            stats["tasks_resolved"] += 1

        parent.last_synced_at = timezone.now()
        parent.save(update_fields=["last_synced_at"])
        stats["users"] += 1

    return stats


def _run_standup_background(channel_id: str) -> None:
    try:
        close_old_connections()
        stats = sync_standup_for_channel(channel_id)
        logger.info("Slack stand-up sync completed for channel %s: %s", channel_id, stats)
    except Exception:
        logger.exception("Slack stand-up sync failed for channel %s", channel_id)
    finally:
        close_old_connections()
        with _running_lock:
            _running_channels.discard(channel_id)


def enqueue_standup_for_channel(channel_id: str) -> bool:
    """
    Fire-and-forget stand-up sync.
    Returns False if a sync is already running for the same channel.
    """
    with _running_lock:
        if channel_id in _running_channels:
            return False
        _running_channels.add(channel_id)

    _executor.submit(_run_standup_background, channel_id)
    return True


def open_resolve_modal_payload(task_title: str, standup_message_id: int) -> dict[str, Any]:
    return {
        "type": "modal",
        "callback_id": "standup_resolve_modal",
        "private_metadata": str(standup_message_id),
        "title": {"type": "plain_text", "text": "Resolve Task"},
        "submit": {"type": "plain_text", "text": "Resolve"},
        "close": {"type": "plain_text", "text": "Cancel"},
        "blocks": [
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*Task:* {task_title}"},
            },
            {
                "type": "input",
                "block_id": "resolve_comment",
                "label": {"type": "plain_text", "text": "Status / Comment"},
                "element": {
                    "type": "plain_text_input",
                    "action_id": "comment",
                    "multiline": True,
                    "placeholder": {"type": "plain_text", "text": "Add resolution details"},
                },
            },
        ],
    }


def resolve_standup_task(standup_message_id: int, comment: str) -> None:
    msg = SlackStandupTaskMessage.objects.select_related("task", "standup_parent__channel").get(id=standup_message_id)
    comment = (comment or "").strip()
    if comment:
        msg.last_comment = comment
    msg.is_active = False
    msg.resolved_at = timezone.now()
    msg.save(update_fields=["last_comment", "is_active", "resolved_at", "updated_at"])
    # Resolve is intentionally no-op on task status for now.
    delete_message(msg.standup_parent.channel.channel_id, msg.message_ts)


def skip_standup_task(standup_message_id: int) -> None:
    msg = SlackStandupTaskMessage.objects.select_related("standup_parent__channel").get(id=standup_message_id)
    msg.is_active = False
    msg.resolved_at = timezone.now()
    msg.save(update_fields=["is_active", "resolved_at", "updated_at"])
    # Skip is a no-op on task state; just remove the stand-up reply.
    delete_message(msg.standup_parent.channel.channel_id, msg.message_ts)
