from __future__ import annotations

from rest_framework import serializers

from core.models import LeaveRequest


class LeaveRequestSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    decided_by_name = serializers.SerializerMethodField()
    total_days = serializers.SerializerMethodField()

    class Meta:
        model = LeaveRequest
        fields = [
            "id", "user", "user_name",
            "start_date", "end_date", "reason",
            "status", "leave_type", "is_salary_cut", "approval_note",
            "rejection_reason",
            "decided_by", "decided_by_name", "decided_at",
            "total_days",
            "created_at", "updated_at",
        ]
        # user is pinned server-side to request.user (see perform_create).
        # Approval/rejection fields are only set via dedicated endpoints, not the
        # main create/update flow — they go through approve/reject actions.
        read_only_fields = [
            "user",
            "status", "leave_type", "is_salary_cut", "approval_note",
            "rejection_reason", "decided_by", "decided_by_name", "decided_at",
            "user_name", "total_days", "created_at", "updated_at",
        ]

    def get_user_name(self, obj):
        u = obj.user
        return (u.first_name or u.username) if u else None

    def get_decided_by_name(self, obj):
        u = obj.decided_by
        return (u.first_name or u.username) if u else None

    def get_total_days(self, obj):
        return obj.total_days

    def validate(self, attrs):
        start = attrs.get("start_date") or getattr(self.instance, "start_date", None)
        end = attrs.get("end_date") or getattr(self.instance, "end_date", None)
        if start and end and end < start:
            raise serializers.ValidationError("end_date must be on or after start_date")
        return attrs
