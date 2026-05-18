from __future__ import annotations

from typing import cast

from django.utils import timezone
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated

from apps.core.selectors import build_visible_user_ids
from core.models import DailyPlanItem, TaskAssignment, User
from core.serializers import DailyPlanItemSerializer


def _is_manager(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or getattr(user, "role", "") in ("manager", "superuser"))
    )


class DailyPlanItemViewSet(viewsets.ModelViewSet):
    """An employee's day plan.

    - Items can only be created/edited/deleted for the *current* date.
    - Each item must reference a task the employee is assigned to.
    - Owners manage their own; managers/superusers may *read* the plans of
      users within their visibility tree (no writes).
    """

    serializer_class = DailyPlanItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = cast(User, self.request.user)
        qs = (
            DailyPlanItem.objects.select_related("user", "task", "project")
            .prefetch_related("time_entries")
            .all()
        )

        target = self.request.query_params.get("user")
        date = self.request.query_params.get("date")

        if target and target not in ("me", str(user.id)):
            if not _is_manager(user):
                return DailyPlanItem.objects.none()
            visible = build_visible_user_ids(user)
            qs = qs.filter(user_id=target, user_id__in=visible)
        else:
            qs = qs.filter(user_id=user.id)

        if date:
            qs = qs.filter(plan_date=date)
        return qs

    def perform_create(self, serializer):
        user = cast(User, self.request.user)
        task = serializer.validated_data.get("task")
        if task is None:
            raise ValidationError({"task": "An assigned task is required."})

        # Must be a task the employee is actually assigned to.
        is_mgr = _is_manager(user)
        if not is_mgr and not TaskAssignment.objects.filter(task=task, assignee=user).exists():
            raise ValidationError(
                {"task": "You can only plan tasks that are assigned to you."}
            )

        serializer.save(
            user=user,
            project=task.project,
            plan_date=timezone.localdate(),
        )

    def _guard_writable(self, instance: DailyPlanItem):
        user = cast(User, self.request.user)
        if instance.user_id != user.id:
            raise PermissionDenied("You can only modify your own daily plan.")
        if instance.plan_date != timezone.localdate():
            raise PermissionDenied(
                "Past days are locked — you can only change today's plan."
            )

    def perform_update(self, serializer):
        self._guard_writable(serializer.instance)
        # plan_date / user / project stay server-controlled.
        serializer.save()

    def perform_destroy(self, instance):
        self._guard_writable(instance)
        instance.delete()
