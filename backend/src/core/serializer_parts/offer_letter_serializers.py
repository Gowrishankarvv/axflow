from __future__ import annotations

from rest_framework import serializers

from core.models import OfferLetter


class OfferLetterSerializer(serializers.ModelSerializer):
    recipient_username = serializers.SerializerMethodField()
    sent_by_name = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()
    attachment_name = serializers.SerializerMethodField()

    class Meta:
        model = OfferLetter
        fields = [
            "id",
            "recipient", "recipient_username",
            "recipient_email_snapshot", "recipient_name_snapshot",
            "subject", "body", "content",
            "attachment_url", "attachment_name",
            "sent_by", "sent_by_name",
            "sent_at", "status", "error_message",
        ]
        read_only_fields = fields  # everything is set server-side via the create action

    def get_recipient_username(self, obj):
        u = obj.recipient
        return (u.first_name or u.username) if u else None

    def get_sent_by_name(self, obj):
        u = obj.sent_by
        return (u.first_name or u.username) if u else None

    def get_attachment_url(self, obj):
        if not obj.attachment:
            return None
        request = self.context.get("request")
        url = obj.attachment.url
        return request.build_absolute_uri(url) if request else url

    def get_attachment_name(self, obj):
        if not obj.attachment:
            return None
        return obj.attachment.name.rsplit("/", 1)[-1]
