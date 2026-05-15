from __future__ import annotations

from rest_framework import serializers

from tables import TaskExtensionRequest


class TaskExtensionRequestSerializer(serializers.ModelSerializer):
    task_title = serializers.CharField(source="task.title", read_only=True)
    project_id = serializers.IntegerField(source="task.project_id", read_only=True)
    project_name = serializers.CharField(source="task.project.name", read_only=True)
    requester_name = serializers.SerializerMethodField()
    decided_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TaskExtensionRequest
        fields = [
            "id",
            "task",
            "task_title",
            "project_id",
            "project_name",
            "requester",
            "requester_name",
            "current_due_date",
            "requested_due_date",
            "reason",
            "status",
            "decided_by",
            "decided_by_name",
            "decided_at",
            "decision_note",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "requester",
            "current_due_date",
            "status",
            "decided_by",
            "decided_at",
            "created_at",
            "updated_at",
        ]

    def get_requester_name(self, obj):
        u = obj.requester
        if not u:
            return None
        return (u.first_name + " " + u.last_name).strip() or u.username

    def get_decided_by_name(self, obj):
        u = obj.decided_by
        if not u:
            return None
        return (u.first_name + " " + u.last_name).strip() or u.username
