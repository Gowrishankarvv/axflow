from __future__ import annotations

from typing import cast

from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.models import Notification
from core.serializers import NotificationSerializer
from tables import User


class NotificationViewSet(viewsets.ModelViewSet):
    """Per-user notifications. Each user sees only their own."""
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["is_read", "kind"]
    ordering_fields = ["created_at", "is_read"]
    # No POSTs from the API — notifications are created by signal handlers only.
    # PATCH stays open so the UI can flip is_read.
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        user = cast(User, self.request.user)
        return Notification.objects.filter(user=user).select_related("actor")

    def partial_update(self, request, *args, **kwargs):
        notification = self.get_object()
        # get_queryset already restricts to request.user, but defence in depth:
        if notification.user_id != request.user.id:
            return Response({"detail": "Forbidden"}, status=403)
        # Only allow flipping is_read; ignore everything else.
        is_read = request.data.get("is_read")
        if is_read is True or str(is_read).lower() in ("true", "1", "yes"):
            if not notification.is_read:
                notification.is_read = True
                notification.read_at = timezone.now()
                notification.save(update_fields=["is_read", "read_at"])
        elif is_read is False or str(is_read).lower() in ("false", "0", "no"):
            if notification.is_read:
                notification.is_read = False
                notification.read_at = None
                notification.save(update_fields=["is_read", "read_at"])
        return Response(self.get_serializer(notification).data)

    @action(detail=False, methods=["post"], url_path="mark_all_read")
    def mark_all_read(self, request):
        now = timezone.now()
        updated = Notification.objects.filter(
            user=request.user, is_read=False
        ).update(is_read=True, read_at=now)
        return Response({"updated": updated})

    @action(detail=False, methods=["get"], url_path="unread_count")
    def unread_count(self, request):
        count = Notification.objects.filter(user=request.user, is_read=False).count()
        return Response({"count": count})
