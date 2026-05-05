from __future__ import annotations

import json
import os
from typing import Any
from urllib import error, request


SLACK_API_BASE = "https://slack.com/api"


class SlackApiError(RuntimeError):
    pass


def _api_call(method: str, payload: dict[str, Any]) -> dict[str, Any]:
    token = os.environ.get("SLACK_BOT_TOKEN", "")
    if not token:
        raise SlackApiError("SLACK_BOT_TOKEN is not configured")

    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url=f"{SLACK_API_BASE}/{method}",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=utf-8",
        },
    )

    try:
        with request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="ignore")
        raise SlackApiError(f"Slack HTTP error {exc.code}: {raw}") from exc
    except Exception as exc:
        raise SlackApiError(f"Slack API request failed: {exc}") from exc

    if not data.get("ok"):
        raise SlackApiError(f"Slack API error: {data.get('error', 'unknown_error')}")
    return data


def post_message(channel: str, text: str, *, thread_ts: str | None = None, blocks: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "channel": channel,
        "text": text,
    }
    if thread_ts:
        payload["thread_ts"] = thread_ts
    if blocks is not None:
        payload["blocks"] = blocks
    return _api_call("chat.postMessage", payload)


def update_message(channel: str, ts: str, text: str, *, blocks: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "channel": channel,
        "ts": ts,
        "text": text,
    }
    if blocks is not None:
        payload["blocks"] = blocks
    return _api_call("chat.update", payload)


def open_view(trigger_id: str, view: dict[str, Any]) -> dict[str, Any]:
    return _api_call("views.open", {"trigger_id": trigger_id, "view": view})


def delete_message(channel: str, ts: str) -> dict[str, Any]:
    return _api_call("chat.delete", {"channel": channel, "ts": ts})


def lookup_user_id_by_email(email: str) -> str | None:
    data = _api_call("users.lookupByEmail", {"email": email})
    user = data.get("user") or {}
    user_id = user.get("id")
    return str(user_id) if user_id else None


def remove_reaction(name: str, channel: str, timestamp: str) -> dict[str, Any]:
    return _api_call(
        "reactions.remove",
        {
            "name": name,
            "channel": channel,
            "timestamp": timestamp,
        },
    )
