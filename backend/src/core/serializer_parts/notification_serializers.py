from __future__ import annotations

from rest_framework import serializers

from core.models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            "id", "user", "actor", "actor_name",
            "kind", "title", "message", "link",
            "is_read", "read_at", "created_at",
        ]
        # All write paths go through the signal handler or dedicated actions —
        # the API exposes the model read-only except for is_read.
        read_only_fields = [
            "user", "actor", "actor_name",
            "kind", "title", "message", "link",
            "read_at", "created_at",
        ]

    def get_actor_name(self, obj):
        u = obj.actor
        return (u.first_name or u.username) if u else None
