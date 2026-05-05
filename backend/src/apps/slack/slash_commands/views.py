from __future__ import annotations

import os
from urllib.parse import parse_qs

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.slack.bot import verify_slack_signature
from apps.slack.client import SlackApiError, open_view
from apps.slack.slash_commands.service import (
    SlashContext,
    build_subscribe_modal,
    build_unsubscribe_modal,
    build_add_task_modal,
    handle_shark_slash_command,
    parse_action,
)


class SharkSlashCommandView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        raw_body = request.body or b""
        timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
        signature = request.headers.get("X-Slack-Signature", "")
        require_signature = os.environ.get("SLACK_VERIFY_SIGNATURE", "1") not in {"0", "false", "False"}
        if require_signature and not verify_slack_signature(raw_body, timestamp, signature):
            return Response({"detail": "Invalid Slack signature"}, status=status.HTTP_401_UNAUTHORIZED)

        parsed = parse_qs(raw_body.decode("utf-8", errors="ignore"))
        ctx = SlashContext(
            channel_id=(parsed.get("channel_id", [""])[0] or "").strip(),
            channel_name=(parsed.get("channel_name", [""])[0] or "").strip(),
            actor_slack_user_id=(parsed.get("user_id", [""])[0] or "").strip(),
            actor_slack_username=(parsed.get("user_name", [""])[0] or "").strip(),
            command=(parsed.get("command", [""])[0] or "").strip(),
            text=(parsed.get("text", [""])[0] or "").strip(),
            trigger_id=(parsed.get("trigger_id", [""])[0] or "").strip(),
        )

        if not ctx.channel_id:
            return Response({"detail": "Missing channel_id"}, status=status.HTTP_400_BAD_REQUEST)

        if parse_action(ctx.text) == "add-task":
            if not ctx.trigger_id:
                return Response({"response_type": "ephemeral", "text": "Missing trigger_id for opening modal."})
            try:
                open_view(ctx.trigger_id, build_add_task_modal())
            except Exception as exc:
                return Response({"response_type": "ephemeral", "text": f"Command failed: {exc}"})
            return Response({"response_type": "ephemeral", "text": "Opened add-task modal."})

        if parse_action(ctx.text) == "subscribe":
            if not ctx.trigger_id:
                return Response({"response_type": "ephemeral", "text": "Missing trigger_id for opening modal."})
            try:
                open_view(ctx.trigger_id, build_subscribe_modal(ctx))
            except Exception as exc:
                return Response({"response_type": "ephemeral", "text": f"Command failed: {exc}"})
            return Response({"response_type": "ephemeral", "text": "Opened subscribe modal."})

        if parse_action(ctx.text) == "unsubscribe":
            if not ctx.trigger_id:
                return Response({"response_type": "ephemeral", "text": "Missing trigger_id for opening modal."})
            try:
                open_view(ctx.trigger_id, build_unsubscribe_modal(ctx))
            except Exception as exc:
                return Response({"response_type": "ephemeral", "text": f"Command failed: {exc}"})
            return Response({"response_type": "ephemeral", "text": "Opened unsubscribe modal."})

        try:
            text = handle_shark_slash_command(ctx)
        except SlackApiError as exc:
            raw = str(exc)
            if "channel_not_found" in raw:
                text = (
                    "Slack cannot find or access this channel. "
                    "Please confirm the slash command is run inside the target channel, "
                    "the bot token belongs to this workspace, and invite the bot to the channel."
                )
            else:
                text = f"Slack command failed: {raw}"
        except Exception as exc:
            text = f"Command failed: {exc}"
        return Response({"response_type": "ephemeral", "text": text})
