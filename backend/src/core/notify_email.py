"""Single entry point for sending an in-app notification AND, when possible,
mirroring it via email. Used by the task-assignment signal, the daily reminder
command, and the extension-request approve/reject flow.

Email failures never bubble up -- they're logged and the Notification still
gets created, so the user always sees the update in-app.
"""
from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import EmailMessage

from core.models import Notification, User

logger = logging.getLogger(__name__)


def notify(
    *,
    user: User,
    kind: str,
    title: str,
    message: str = "",
    link: str = "",
    actor: User | None = None,
    send_email: bool = True,
    email_subject: str | None = None,
) -> Notification:
    """Create a Notification row, then optionally email the same content.

    Returns the saved Notification so callers can attach further metadata.
    """
    notif = Notification.objects.create(
        user=user,
        actor=actor,
        kind=kind,
        title=title,
        message=message,
        link=link,
    )

    if send_email and user.email:
        try:
            from_email = settings.DEFAULT_FROM_EMAIL or settings.EMAIL_HOST_USER
            if not from_email:
                logger.info("notify_email: skipped (no DEFAULT_FROM_EMAIL configured)")
                return notif
            subject = email_subject or title
            body = message or title
            EmailMessage(
                subject=subject,
                body=body,
                from_email=from_email,
                to=[user.email],
            ).send(fail_silently=False)
        except Exception:  # pragma: no cover - smtp issues are environment-specific
            logger.exception("notify_email: failed to email user_id=%s kind=%s", user.id, kind)

    return notif
