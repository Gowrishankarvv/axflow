from __future__ import annotations

import json
from dataclasses import dataclass
from django.core.validators import validate_email
from django.core.exceptions import ValidationError

from apps.slack.models import (
    SlackChannelEmailSubscription,
    SlackChannelRegistration,
    SlackChannelSubscriptionProject,
)
from apps.slack.task_tracker.standup_service import enqueue_standup_for_channel
from tables import Project, User


@dataclass
class SlashContext:
    channel_id: str
    channel_name: str
    actor_slack_user_id: str
    actor_slack_username: str
    command: str
    text: str
    trigger_id: str


def _normalize_mention(raw: str) -> str:
    value = (raw or "").strip()
    if not value:
        return ""
    return value


def register_channel(ctx: SlashContext) -> SlackChannelRegistration:
    channel, _ = SlackChannelRegistration.objects.update_or_create(
        channel_id=ctx.channel_id,
        defaults={
            "channel_name": ctx.channel_name or "",
            "created_by_slack_user_id": ctx.actor_slack_user_id or "",
            "created_by_slack_username": ctx.actor_slack_username or "",
        },
    )
    return channel


def _project_options() -> list[dict]:
    projects = list(Project.objects.order_by("name").values("id", "name")[:100])
    return [
        {
            "text": {"type": "plain_text", "text": (p["name"][:75] if p["name"] else f"Project {p['id']}")},
            "value": str(p["id"]),
        }
        for p in projects
    ]


def build_subscribe_modal(ctx: SlashContext) -> dict:
    options = _project_options()
    return {
        "type": "modal",
        "callback_id": "shark_subscribe_modal",
        "private_metadata": json.dumps(
            {
                "channel_id": ctx.channel_id,
                "channel_name": ctx.channel_name,
                "actor_slack_user_id": ctx.actor_slack_user_id,
                "actor_slack_username": ctx.actor_slack_username,
            }
        ),
        "title": {"type": "plain_text", "text": "Subscribe User"},
        "submit": {"type": "plain_text", "text": "Subscribe"},
        "close": {"type": "plain_text", "text": "Cancel"},
        "blocks": [
            {
                "type": "input",
                "block_id": "email",
                "label": {"type": "plain_text", "text": "Email"},
                "element": {"type": "plain_text_input", "action_id": "value"},
            },
            {
                "type": "input",
                "block_id": "slack_user",
                "label": {"type": "plain_text", "text": "Slack User"},
                "element": {"type": "users_select", "action_id": "value"},
            },
            {
                "type": "input",
                "block_id": "projects",
                "label": {"type": "plain_text", "text": "Projects"},
                "element": {
                    "type": "multi_static_select",
                    "action_id": "value",
                    "options": options or [
                        {
                            "text": {"type": "plain_text", "text": "No projects available"},
                            "value": "no_project",
                        }
                    ],
                },
            },
        ],
    }


def build_unsubscribe_modal(ctx: SlashContext) -> dict:
    channel = register_channel(ctx)
    subscriptions = list(channel.email_subscriptions.order_by("email").values_list("email", flat=True)[:100])
    options = [
        {
            "text": {"type": "plain_text", "text": email},
            "value": email,
        }
        for email in subscriptions
    ] or [
        {
            "text": {"type": "plain_text", "text": "No subscriptions available"},
            "value": "__none__",
        }
    ]
    return {
        "type": "modal",
        "callback_id": "shark_unsubscribe_modal",
        "private_metadata": json.dumps({"channel_id": ctx.channel_id, "channel_name": ctx.channel_name}),
        "title": {"type": "plain_text", "text": "Unsubscribe"},
        "submit": {"type": "plain_text", "text": "Unsubscribe"},
        "close": {"type": "plain_text", "text": "Cancel"},
        "blocks": [
            {
                "type": "input",
                "block_id": "emails",
                "label": {"type": "plain_text", "text": "Users (emails) to unsubscribe"},
                "element": {"type": "multi_static_select", "action_id": "value", "options": options},
            }
        ],
    }


def apply_subscribe_modal_submission(payload: dict) -> str:
    metadata_raw = payload.get("view", {}).get("private_metadata", "{}")
    metadata = json.loads(metadata_raw or "{}")
    state = payload.get("view", {}).get("state", {}).get("values", {})
    email = (
        state.get("email", {})
        .get("value", {})
        .get("value", "")
        .strip()
        .lower()
    )
    if not email:
        return "Subscribe failed: missing email."
    try:
        validate_email(email)
    except ValidationError:
        return f"Subscribe failed: invalid email '{email}'."

    selected_slack_user = (
        state.get("slack_user", {})
        .get("value", {})
        .get("selected_user", "")
    )
    selected_project_opts = (
        state.get("projects", {})
        .get("value", {})
        .get("selected_options", [])
    )
    project_ids = []
    for opt in selected_project_opts:
        value = (opt.get("value") or "").strip()
        if value.isdigit():
            project_ids.append(int(value))
    if not project_ids:
        return "Subscribe failed: please select at least one project."

    channel, _ = SlackChannelRegistration.objects.update_or_create(
        channel_id=(metadata.get("channel_id") or "").strip(),
        defaults={
            "channel_name": (metadata.get("channel_name") or "").strip(),
            "created_by_slack_user_id": (metadata.get("actor_slack_user_id") or "").strip(),
            "created_by_slack_username": (metadata.get("actor_slack_username") or "").strip(),
        },
    )

    app_user = User.objects.filter(email__iexact=email).first()
    mention = f"<@{selected_slack_user}>" if selected_slack_user else ""

    sub, _ = SlackChannelEmailSubscription.objects.update_or_create(
        channel=channel,
        email=email,
        defaults={
            "app_user": app_user,
            "slack_user_ref": _normalize_mention(mention),
            "added_by_slack_user_id": (metadata.get("actor_slack_user_id") or "").strip(),
            "added_by_slack_username": (metadata.get("actor_slack_username") or "").strip(),
            "is_active": True,
        },
    )
    valid_project_ids = set(Project.objects.filter(id__in=project_ids).values_list("id", flat=True))
    SlackChannelSubscriptionProject.objects.filter(subscription=sub).exclude(project_id__in=valid_project_ids).delete()
    existing = set(
        SlackChannelSubscriptionProject.objects.filter(subscription=sub, project_id__in=valid_project_ids).values_list(
            "project_id", flat=True
        )
    )
    SlackChannelSubscriptionProject.objects.bulk_create(
        [
            SlackChannelSubscriptionProject(subscription=sub, project_id=pid)
            for pid in valid_project_ids
            if pid not in existing
        ],
        ignore_conflicts=True,
    )
    return f"Subscribed {email} for {len(valid_project_ids)} project(s) in #{channel.channel_name or channel.channel_id}."


def apply_unsubscribe_modal_submission(payload: dict) -> str:
    metadata_raw = payload.get("view", {}).get("private_metadata", "{}")
    metadata = json.loads(metadata_raw or "{}")
    channel_id = (metadata.get("channel_id") or "").strip()
    if not channel_id:
        return "Unsubscribe failed: missing channel."

    state = payload.get("view", {}).get("state", {}).get("values", {})
    selected_options = (
        state.get("emails", {})
        .get("value", {})
        .get("selected_options", [])
    )
    emails = [((opt.get("value") or "").strip().lower()) for opt in selected_options]
    emails = [e for e in emails if e and e != "__none__"]
    if not emails:
        return "No users selected to unsubscribe."

    deleted_count, _ = SlackChannelEmailSubscription.objects.filter(channel__channel_id=channel_id, email__in=emails).delete()
    return f"Unsubscribed {len(emails)} user(s). Deleted entries: {deleted_count}."


def parse_action(text: str) -> str:
    parts = [p for p in (text or "").strip().split() if p]
    return parts[0].lower() if parts else ""


def build_add_task_modal() -> dict:
    projects = list(Project.objects.order_by("name").values("id", "name")[:100])
    project_options = [
        {
            "text": {"type": "plain_text", "text": (p["name"][:75] if p["name"] else f"Project {p['id']}")},
            "value": str(p["id"]),
        }
        for p in projects
    ] or [
        {
            "text": {"type": "plain_text", "text": "No projects available"},
            "value": "no_project",
        }
    ]

    return {
        "type": "modal",
        "callback_id": "shark_add_task_modal",
        "title": {"type": "plain_text", "text": "Add Task"},
        "submit": {"type": "plain_text", "text": "Create"},
        "close": {"type": "plain_text", "text": "Cancel"},
        "blocks": [
            {
                "type": "input",
                "block_id": "project",
                "label": {"type": "plain_text", "text": "Project"},
                "element": {
                    "type": "static_select",
                    "action_id": "value",
                    "options": project_options,
                },
            },
            {
                "type": "input",
                "block_id": "title",
                "label": {"type": "plain_text", "text": "Title"},
                "element": {"type": "plain_text_input", "action_id": "value"},
            },
            {
                "type": "input",
                "block_id": "from_date",
                "label": {"type": "plain_text", "text": "From Date"},
                "element": {"type": "datepicker", "action_id": "value"},
            },
            {
                "type": "input",
                "block_id": "to_date",
                "label": {"type": "plain_text", "text": "To Date"},
                "element": {"type": "datepicker", "action_id": "value"},
            },
            {
                "type": "input",
                "block_id": "description",
                "label": {"type": "plain_text", "text": "Description"},
                "element": {"type": "plain_text_input", "action_id": "value", "multiline": True},
            },
        ],
    }


def handle_shark_slash_command(ctx: SlashContext) -> str:
    parts = [p for p in (ctx.text or "").strip().split() if p]
    help_text = (
        "*shark-tracker commands*\n"
        "• `/shark help` — Show this help message.\n"
        "• `/shark subscribe` — Open modal with Email, Slack user, and project subscriptions.\n"
        "• `/shark unsubscribe` — Open modal to select subscribed users and remove their subscriptions.\n"
        "• `/shark stand-up` — Run async stand-up sync for subscribed users in this channel (parent thread + task replies).\n"
        "• `/shark add-task` — Open add-task modal (Project, Title, From Date, To Date, Description). Currently no-op on submit."
    )
    if not parts:
        return help_text

    action = parts[0].lower()
    if action == "help":
        return help_text
    if action == "subscribe":
        return "Use: /shark subscribe"
    if action == "unsubscribe":
        return "Use: /shark unsubscribe"
    if action == "stand-up":
        channel = register_channel(ctx)
        queued = enqueue_standup_for_channel(channel.channel_id)
        if queued:
            return f"Stand-up sync started asynchronously for #{channel.channel_name or channel.channel_id}."
        return f"Stand-up sync is already running for #{channel.channel_name or channel.channel_id}. Please wait."

    return f"Unknown command: {action}\n\n{help_text}"
