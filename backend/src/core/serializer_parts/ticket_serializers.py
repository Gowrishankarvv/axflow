from __future__ import annotations

from rest_framework import serializers

from tables import Ticket


class TicketSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    resolved_by_name = serializers.SerializerMethodField()
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    attachment_url = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            "id",
            "kind",
            "kind_display",
            "title",
            "description",
            "attachment",
            "attachment_url",
            "status",
            "status_display",
            "resolution_note",
            "resolved_by",
            "resolved_by_name",
            "resolved_at",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "created_by",
            "resolved_by",
            "resolved_at",
            "created_at",
            "updated_at",
        ]
        # The submitter never sends `status` or `resolution_note` themselves --
        # the viewset gates those to managers via custom actions.
        extra_kwargs = {
            "status": {"required": False},
            "resolution_note": {"required": False},
        }

    def get_created_by_name(self, obj):
        u = obj.created_by
        if not u:
            return None
        return (u.first_name + " " + u.last_name).strip() or u.username

    def get_resolved_by_name(self, obj):
        u = obj.resolved_by
        if not u:
            return None
        return (u.first_name + " " + u.last_name).strip() or u.username

    def get_attachment_url(self, obj):
        if not obj.attachment:
            return None
        request = self.context.get("request")
        url = obj.attachment.url
        return request.build_absolute_uri(url) if request else url
