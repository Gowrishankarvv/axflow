from __future__ import annotations

from django.db.models import QuerySet

from core.models import Comment


def comment_qs() -> QuerySet[Comment]:
    return Comment.objects.all()


def get_comments_for_time_entry(time_entry_id: int) -> QuerySet[Comment]:
    return comment_qs().filter(time_entry_id=time_entry_id)
