from django.db import models
from rest_framework import serializers

from tables import ActiveTimeEntry, ClockSession, Tag, TimeEntry, User
from apps.core.api.time_entries.services import validate_project_access


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name", "emoji", "category"]


class TimeEntrySerializer(serializers.ModelSerializer):
    overlapping_warning = serializers.SerializerMethodField()
    user_name = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    task_title = serializers.SerializerMethodField()
    manager_comment_by_name = serializers.SerializerMethodField(read_only=True)
    tags = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False)
    tag_names = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = TimeEntry
        fields = [
            "id",
            "user",
            "user_name",
            "project",
            "project_name",
            "task",
            "task_title",
            "start_datetime",
            "end_datetime",
            "duration",
            "description",
            "created_at",
            "updated_at",
            "overlapping_warning",
            "manager_comment",
            "manager_comment_at",
            "manager_comment_by",
            "manager_comment_by_name",
            "tags",
            "tag_names",
        ]
        read_only_fields = ["duration", "created_at", "updated_at"]
        extra_kwargs = {
            "user": {"required": False},
            "project": {"required": True},
        }

    def create(self, validated_data):
        request_user = self.context["request"].user
        data_user = validated_data.get("user")
        tag_ids = validated_data.pop("tags", [])

        # Resolve the target user for this time entry before mutating validated_data.
        if isinstance(data_user, models.Model):
            target_user = data_user
        elif data_user is not None:
            target_user = User.objects.filter(id=data_user).first()
        else:
            target_user = request_user

        if request_user.is_superuser or request_user.role in ("superuser", "manager"):
            if data_user:
                if isinstance(data_user, models.Model):
                    validated_data["user_id"] = data_user.id
                    validated_data.pop("user", None)
                else:
                    validated_data["user_id"] = data_user
            else:
                validated_data["user"] = request_user
        else:
            validated_data["user"] = request_user

        # Ensure the (target) user is allowed to log time against the selected project.
        project = validated_data.get("project")
        if project and target_user:
            validate_project_access(target_user, project)

        task = validated_data.get("task")
        if (
            task
            and not (request_user.is_superuser or request_user.role in ("superuser", "manager"))
            and not task.assignees.filter(id=validated_data["user"].id).exists()
        ):
            raise serializers.ValidationError({"task": "User must be assigned to this task to log time."})

        instance = super().create(validated_data)
        if tag_ids:
            instance.tags.set(tag_ids)
        return instance

    def update(self, instance, validated_data):
        tag_ids = validated_data.pop("tags", None)
        updated_instance = super().update(instance, validated_data)
        if tag_ids is not None:
            updated_instance.tags.set(tag_ids)
        return updated_instance

    def get_user_name(self, obj):
        u = getattr(obj, "user", None)
        return (u.first_name or u.username) if u else None

    def get_project_name(self, obj):
        p = getattr(obj, "project", None)
        return p.name if p else None

    def get_task_title(self, obj):
        t = getattr(obj, "task", None)
        return t.title if t else None

    def get_manager_comment_by_name(self, obj):
        u = getattr(obj, "manager_comment_by", None)
        return (u.first_name or u.username) if u else None

    def get_tag_names(self, obj):
        if hasattr(obj, "tags"):
            return [{"id": tag.id, "name": tag.name, "emoji": tag.emoji, "category": tag.category} for tag in obj.tags.all()]
        return []

    def get_overlapping_warning(self, obj):
        annotated = getattr(obj, "has_overlap", None)
        if annotated is not None:
            return annotated
        qs = TimeEntry.objects.filter(
            user=obj.user,
            start_datetime__lt=obj.end_datetime,
            end_datetime__gt=obj.start_datetime,
        ).exclude(id=obj.id)
        return qs.exists()

    def validate(self, attrs):
        start = attrs.get("start_datetime") or getattr(self.instance, "start_datetime", None)
        end = attrs.get("end_datetime") or getattr(self.instance, "end_datetime", None)
        if start and end and end <= start:
            raise serializers.ValidationError("end_datetime must be greater than start_datetime")
        project = attrs.get("project") or getattr(self.instance, "project", None)
        task = attrs.get("task") or getattr(self.instance, "task", None)
        if task and project and task.project_id != project.id:
            raise serializers.ValidationError("task does not belong to selected project")
        if not project:
            raise serializers.ValidationError("project is required")
        return attrs


class ActiveTimeEntrySerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    task_title = serializers.SerializerMethodField()

    class Meta:
        model = ActiveTimeEntry
        fields = [
            "id",
            "user",
            "user_name",
            "project",
            "project_name",
            "task",
            "task_title",
            "start_datetime",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def get_user_name(self, obj):
        user = getattr(obj, "user", None)
        return (user.first_name or user.username) if user else None

    def get_project_name(self, obj):
        project = getattr(obj, "project", None)
        return project.name if project else None

    def get_task_title(self, obj):
        task = getattr(obj, "task", None)
        return task.title if task else None


class ClockSessionSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = ClockSession
        fields = ["id", "user", "user_name", "clock_in_time", "clock_out_time", "duration", "date", "created_at", "updated_at"]
        read_only_fields = ["duration", "date", "created_at", "updated_at"]

    def get_user_name(self, obj):
        u = obj.user
        return (u.first_name or u.username) if u else None

    def validate(self, attrs):
        clock_in = attrs.get("clock_in_time") or getattr(self.instance, "clock_in_time", None)
        clock_out = attrs.get("clock_out_time") or getattr(self.instance, "clock_out_time", None)
        if clock_out and clock_in and clock_out <= clock_in:
            raise serializers.ValidationError("clock_out_time must be greater than clock_in_time")
        return attrs
