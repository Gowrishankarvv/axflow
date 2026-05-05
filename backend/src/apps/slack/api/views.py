from __future__ import annotations

import os

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.slack.bot import BOT_NAME, handle_event, parse_payload, verify_slack_signature


class SlackBotHealthView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {
                "ok": True,
                "module": "slack",
                "bot": BOT_NAME,
            }
        )


class SlackEventsView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        raw_body = request.body or b""
        timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
        signature = request.headers.get("X-Slack-Signature", "")
        require_signature = os.environ.get("SLACK_VERIFY_SIGNATURE", "1") not in {"0", "false", "False"}

        if require_signature and not verify_slack_signature(raw_body, timestamp, signature):
            return Response({"detail": "Invalid Slack signature"}, status=status.HTTP_401_UNAUTHORIZED)

        payload = parse_payload(raw_body)
        if not payload:
            return Response({"detail": "Invalid payload"}, status=status.HTTP_400_BAD_REQUEST)

        data = handle_event(payload)
        return Response(data, status=status.HTTP_200_OK)

