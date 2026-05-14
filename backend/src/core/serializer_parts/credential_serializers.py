from __future__ import annotations

from rest_framework import serializers

from tables import ProjectCredential


class ProjectCredentialSerializer(serializers.ModelSerializer):
    kind_display = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ProjectCredential
        fields = [
            "id",
            "project",
            "kind",
            "kind_custom",
            "kind_display",
            "label",
            "username",
            "secret",
            "url",
            "notes",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_by", "created_at", "updated_at"]

    def get_kind_display(self, obj):
        if obj.kind == "other" and obj.kind_custom:
            return obj.kind_custom
        return obj.get_kind_display()

    def get_created_by_name(self, obj):
        u = obj.created_by
        if not u:
            return None
        return (u.first_name + " " + u.last_name).strip() or u.username
