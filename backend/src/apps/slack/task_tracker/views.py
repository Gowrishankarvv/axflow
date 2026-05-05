from __future__ import annotations

import json
import os
from urllib.parse import parse_qs

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.slack.bot import verify_slack_signature
from apps.slack.client import open_view
from apps.slack.models import SlackStandupParent, SlackStandupTaskMessage
from apps.slack.slash_commands.service import apply_subscribe_modal_submission, apply_unsubscribe_modal_submission
from apps.slack.task_tracker.standup_service import (
    open_resolve_modal_payload,
    resolve_standup_parent,
    resolve_standup_task,
    skip_standup_task,
)
from apps.slack.task_tracker.service import mark_task_done_from_interaction, sync_task_tracker


class SlackTaskTrackerSyncView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not (request.user.is_superuser or getattr(request.user, "role", "") in {"superuser", "manager"}):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        user_ids = request.data.get("user_ids") if isinstance(request.data, dict) else None
        if isinstance(user_ids, list):
            parsed_ids = [int(x) for x in user_ids]
        else:
            parsed_ids = None

        channel_id = request.data.get("channel_id") if isinstance(request.data, dict) else None
        try:
            stats = sync_task_tracker(channel_id=channel_id, user_ids=parsed_ids)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"ok": True, "module": "task-tracker", "stats": stats})


class SlackTaskTrackerInteractionsView(APIView):
    permission_classes = []
    authentication_classes = []

    def post(self, request):
        raw_body = request.body or b""
        timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
        signature = request.headers.get("X-Slack-Signature", "")
        require_signature = os.environ.get("SLACK_VERIFY_SIGNATURE", "1") not in {"0", "false", "False"}
        if require_signature and not verify_slack_signature(raw_body, timestamp, signature):
            return Response({"detail": "Invalid Slack signature"}, status=status.HTTP_401_UNAUTHORIZED)

        parsed = parse_qs(raw_body.decode("utf-8", errors="ignore"))
        payload_raw = parsed.get("payload", ["{}"])[0]
        try:
            payload = json.loads(payload_raw)
        except Exception:
            return Response({"detail": "Invalid interaction payload"}, status=status.HTTP_400_BAD_REQUEST)

        actions = payload.get("actions", []) or []
        if payload.get("type") == "view_submission" and payload.get("view", {}).get("callback_id") == "shark_subscribe_modal":
            apply_subscribe_modal_submission(payload)
            return Response({"response_action": "clear"})

        if payload.get("type") == "view_submission" and payload.get("view", {}).get("callback_id") == "shark_unsubscribe_modal":
            apply_unsubscribe_modal_submission(payload)
            return Response({"response_action": "clear"})

        if payload.get("type") == "view_submission" and payload.get("view", {}).get("callback_id") == "shark_add_task_modal":
            # No-op for now; just close modal.
            return Response({"response_action": "clear"})

        if payload.get("type") == "view_submission" and payload.get("view", {}).get("callback_id") == "standup_resolve_modal":
            metadata = payload.get("view", {}).get("private_metadata", "")
            try:
                standup_message_id = int(metadata)
            except (TypeError, ValueError):
                return Response({"response_action": "errors", "errors": {"resolve_comment": "Invalid task reference"}})

            state = payload.get("view", {}).get("state", {}).get("values", {})
            comment = (
                state.get("resolve_comment", {})
                .get("comment", {})
                .get("value", "")
            )
            try:
                resolve_standup_task(standup_message_id, comment or "")
            except Exception:
                return Response({"response_type": "ephemeral", "text": "Failed to resolve task."})
            return Response({"response_action": "clear"})

        if not actions:
            return Response({"ok": True})

        action = actions[0]
        if action.get("action_id") == "standup_resolve":
            message_ts = payload.get("message", {}).get("ts", "")
            channel_id = payload.get("channel", {}).get("id", "")
            standup_msg = (
                SlackStandupTaskMessage.objects.select_related("task", "standup_parent__channel")
                .filter(message_ts=message_ts, standup_parent__channel__channel_id=channel_id)
                .first()
            )
            if not standup_msg:
                return Response({"response_type": "ephemeral", "text": "Could not find stand-up task message."})

            trigger_id = payload.get("trigger_id", "")
            if trigger_id:
                view = open_resolve_modal_payload(standup_msg.task.title, standup_msg.id)
                open_view(trigger_id, view)
            return Response({"ok": True})

        if action.get("action_id") == "standup_skip":
            message_ts = payload.get("message", {}).get("ts", "")
            channel_id = payload.get("channel", {}).get("id", "")
            standup_msg = (
                SlackStandupTaskMessage.objects.filter(
                    message_ts=message_ts,
                    standup_parent__channel__channel_id=channel_id,
                ).first()
            )
            if not standup_msg:
                return Response({"response_type": "ephemeral", "text": "Could not find stand-up task message."})
            try:
                skip_standup_task(standup_msg.id)
            except Exception:
                return Response({"response_type": "ephemeral", "text": "Failed to skip task."})
            return Response({"ok": True})

        if action.get("action_id") == "standup_parent_resolve":
            message_ts = payload.get("message", {}).get("ts", "")
            channel_id = payload.get("channel", {}).get("id", "")
            parent = (
                SlackStandupParent.objects.filter(
                    parent_ts=message_ts,
                    channel__channel_id=channel_id,
                ).first()
            )
            if not parent:
                return Response({"response_type": "ephemeral", "text": "Could not find stand-up parent thread."})
            try:
                resolve_standup_parent(parent.id)
            except Exception:
                return Response({"response_type": "ephemeral", "text": "Failed to resolve parent thread."})
            return Response({"ok": True})

        if action.get("action_id") == "task_done":
            task_id = int(action.get("value"))
            task = mark_task_done_from_interaction(task_id)
            return Response(
                {
                    "response_type": "ephemeral",
                    "text": f"Marked task as done: {task.title}",
                }
            )

        return Response({"ok": True})
