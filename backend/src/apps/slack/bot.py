from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
from time import time
from typing import Any

from apps.slack.client import delete_message

logger = logging.getLogger(__name__)

BOT_NAME = os.environ.get("SLACK_BOT_NAME", "shark-tracker")


def verify_slack_signature(raw_body: bytes, timestamp: str, signature: str) -> bool:
    signing_secret = os.environ.get("SLACK_SIGNING_SECRET", "")
    if not signing_secret or not timestamp or not signature:
        return False

    # Reject stale requests to reduce replay attacks.
    try:
        ts = int(timestamp)
    except ValueError:
        return False
    if abs(time() - ts) > 60 * 5:
        return False

    basestring = f"v0:{timestamp}:{raw_body.decode('utf-8')}".encode("utf-8")
    computed = "v0=" + hmac.new(signing_secret.encode("utf-8"), basestring, hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, signature)


def parse_payload(raw_body: bytes) -> dict[str, Any]:
    try:
        return json.loads(raw_body.decode("utf-8"))
    except Exception:
        return {}


def handle_event(payload: dict[str, Any]) -> dict[str, Any]:
    # Slack URL verification handshake.
    if payload.get("type") == "url_verification":
        return {"challenge": payload.get("challenge", "")}

    # Keep webhook response fast; event processing can be expanded later.
    event = payload.get("event", {}) or {}
    event_type = event.get("type", "")
    text = (event.get("text") or "").lower()

    if event_type == "reaction_added":
        item = event.get("item", {}) or {}
        channel = (item.get("channel") or "").strip()
        message_ts = str(item.get("ts") or "").strip()
        if channel and message_ts:
            try:
                delete_message(channel, message_ts)
            except Exception:
                # Best-effort cleanup; never fail webhook ack.
                logger.exception("Failed deleting reacted message on %s:%s", channel, message_ts)
        return {"ok": True, "bot": BOT_NAME, "event_type": event_type}

    if event_type == "app_mention" and "task-tracker sync" in text:
        try:
            from apps.slack.task_tracker.service import sync_task_tracker

            stats = sync_task_tracker()
            return {"ok": True, "bot": BOT_NAME, "event_type": event_type, "task_tracker": stats}
        except Exception as exc:
            return {"ok": False, "bot": BOT_NAME, "event_type": event_type, "error": str(exc)}

    return {
        "ok": True,
        "bot": BOT_NAME,
        "event_type": event_type,
    }
