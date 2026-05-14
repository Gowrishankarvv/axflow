from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.notify_email import notify
from core.permissions import IsManager
from core.serializers import TaskExtensionRequestSerializer
from tables import Task, TaskExtensionRequest


def _is_manager(user) -> bool:
    return bool(user and user.is_authenticated and (
        getattr(user, "role", "") in ("manager", "superuser") or user.is_superuser
    ))


def _full_name(u) -> str:
    if not u:
        return ""
    return (u.first_name + " " + u.last_name).strip() or u.username


class TaskExtensionRequestViewSet(viewsets.ModelViewSet):
    """Employees submit extension requests for their assigned tasks. Managers
    approve or reject. On approval, the task's due_date is auto-updated to the
    requested date and the requester is notified."""
    serializer_class = TaskExtensionRequestSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        qs = (
            TaskExtensionRequest.objects
            .select_related("task", "task__project", "requester", "decided_by")
            .all()
        )
        if _is_manager(user):
            return qs
        # Employees see only their own requests
        return qs.filter(requester=user)

    def create(self, request, *args, **kwargs):
        user = request.user
        task_id = request.data.get("task")
        requested_due_date = request.data.get("requested_due_date")
        reason = (request.data.get("reason") or "").strip()

        if not task_id:
            return Response({"task": "required"}, status=400)
        if not requested_due_date:
            return Response({"requested_due_date": "required"}, status=400)

        try:
            task = Task.objects.select_related("project").get(pk=task_id)
        except Task.DoesNotExist:
            return Response({"task": "not found"}, status=400)

        # An assignee on the task -- or a manager -- can file an extension.
        is_assignee = task.assignees.filter(pk=user.pk).exists()
        if not (is_assignee or _is_manager(user)):
            return Response({"detail": "You are not assigned to this task."}, status=403)

        ext = TaskExtensionRequest.objects.create(
            task=task,
            requester=user,
            current_due_date=task.due_date,
            requested_due_date=requested_due_date,
            reason=reason,
            status="pending",
        )

        # Tell managers a new extension request was submitted. We notify the
        # project's created_by user if they're a manager/superuser; otherwise
        # broadcast to all managers tied to this project. Keep it simple:
        # notify the project's created_by user, plus the task's assigned_by.
        notifiable = set()
        if task.project.created_by_id:
            notifiable.add(task.project.created_by_id)
        # Also notify whoever assigned this user to the task originally.
        for ta in task.taskassignment_set.filter(assignee=user):
            if ta.assigned_by_id:
                notifiable.add(ta.assigned_by_id)

        from tables import User
        for uid in notifiable:
            try:
                approver = User.objects.get(pk=uid)
            except User.DoesNotExist:
                continue
            notify(
                user=approver,
                actor=user,
                kind="extension_submitted",
                title=f"Extension request: {task.title}",
                message=(
                    f'{_full_name(user)} requested to extend the due date on task "{task.title}" '
                    f'in project "{task.project.name}" from {task.due_date or "no due date"} '
                    f"to {requested_due_date}."
                    + (f' Reason: "{reason}"' if reason else "")
                ),
                link="/requests",
            )

        return Response(self.get_serializer(ext).data, status=201)

    @action(detail=True, methods=["post"], permission_classes=[IsManager])
    def approve(self, request, pk=None):
        ext = self.get_object()
        if ext.status != "pending":
            return Response({"detail": f"Already {ext.status}."}, status=400)

        decision_note = (request.data.get("decision_note") or "").strip()
        with transaction.atomic():
            ext.status = "approved"
            ext.decided_by = request.user
            ext.decided_at = timezone.now()
            ext.decision_note = decision_note
            ext.save()
            # Auto-update the task's due_date and reset the due-reminder marker
            # so the new date can fire a fresh reminder.
            Task.objects.filter(pk=ext.task_id).update(
                due_date=ext.requested_due_date,
                due_reminder_sent_for=None,
            )

        notify(
            user=ext.requester,
            actor=request.user,
            kind="extension_approved",
            title=f"Extension approved: {ext.task.title}",
            message=(
                f'Your extension on "{ext.task.title}" was approved by {_full_name(request.user)}. '
                f"New due date: {ext.requested_due_date}."
                + (f' Note: "{decision_note}"' if decision_note else "")
            ),
            link=f"/projects/{ext.task.project_id}",
        )
        return Response(self.get_serializer(ext).data)

    @action(detail=True, methods=["post"], permission_classes=[IsManager])
    def reject(self, request, pk=None):
        ext = self.get_object()
        if ext.status != "pending":
            return Response({"detail": f"Already {ext.status}."}, status=400)
        decision_note = (request.data.get("decision_note") or "").strip()
        ext.status = "rejected"
        ext.decided_by = request.user
        ext.decided_at = timezone.now()
        ext.decision_note = decision_note
        ext.save()

        notify(
            user=ext.requester,
            actor=request.user,
            kind="extension_rejected",
            title=f"Extension rejected: {ext.task.title}",
            message=(
                f'Your extension on "{ext.task.title}" was rejected by {_full_name(request.user)}. '
                f"Due date stays at {ext.task.due_date or 'no due date'}."
                + (f' Note: "{decision_note}"' if decision_note else "")
            ),
            link=f"/projects/{ext.task.project_id}",
        )
        return Response(self.get_serializer(ext).data)
