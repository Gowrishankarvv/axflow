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
            "plan_item",
            "done",
        ]
        read_only_fields = ["duration", "created_at", "updated_at"]
        extra_kwargs = {
            "user": {"required": False},
            # Not field-level required: validate() still enforces a project,
            # but allows it to be backfilled from a supplied plan_item.
            "project": {"required": False},
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
        # A plan item may be supplied to tie this hour to the employee's daily
        # plan. Backfill project/task from it so the picker only needs the item.
        plan_item = attrs.get("plan_item") or getattr(self.instance, "plan_item", None)
        if plan_item:
            if not attrs.get("project") and not getattr(self.instance, "project", None):
                attrs["project"] = plan_item.project
            if attrs.get("task") is None and "task" not in attrs and not getattr(self.instance, "task", None):
                attrs["task"] = plan_item.task
            eff_project = attrs.get("project") or getattr(self.instance, "project", None)
            if eff_project and eff_project.id != plan_item.project_id:
                raise serializers.ValidationError(
                    {"plan_item": "Plan item belongs to a different project."}
                )

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
    lunch_duration_seconds = serializers.SerializerMethodField()
    worked_duration_seconds = serializers.SerializerMethodField()

    class Meta:
        model = ClockSession
        fields = [
            "id", "user", "user_name",
            "clock_in_time", "clock_out_time", "duration", "date",
            "lunch_start_time", "lunch_end_time",
            "lunch_duration_seconds", "worked_duration_seconds",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "duration", "date", "created_at", "updated_at",
            "lunch_duration_seconds", "worked_duration_seconds",
        ]

    def get_user_name(self, obj):
        u = obj.user
        return (u.first_name or u.username) if u else None

    def get_lunch_duration_seconds(self, obj):
        ld = obj.lunch_duration
        return int(ld.total_seconds()) if ld else 0

    def get_worked_duration_seconds(self, obj):
        wd = obj.worked_duration
        return int(wd.total_seconds()) if wd else None

    def validate(self, attrs):
        clock_in = attrs.get("clock_in_time") or getattr(self.instance, "clock_in_time", None)
        clock_out = attrs.get("clock_out_time") or getattr(self.instance, "clock_out_time", None)
        if clock_out and clock_in and clock_out <= clock_in:
            raise serializers.ValidationError("clock_out_time must be greater than clock_in_time")
        return attrs


from core.models import DailyPlanItem  # noqa: E402


class DailyPlanItemSerializer(serializers.ModelSerializer):
    """An employee's planned item for *today*, tied to an assigned task.

    Progress is derived from the linked TimeEntry rows: how many hours were
    logged against this item and how many of those were marked done.
    """

    task_title = serializers.SerializerMethodField(read_only=True)
    project_name = serializers.SerializerMethodField(read_only=True)
    user_name = serializers.SerializerMethodField(read_only=True)
    progress = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = DailyPlanItem
        fields = [
            "id",
            "user",
            "user_name",
            "plan_date",
            "task",
            "task_title",
            "project",
            "project_name",
            "description",
            "progress",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "user", "project", "plan_date",
            "created_at", "updated_at",
        ]

    def get_task_title(self, obj):
        return obj.task.title if obj.task_id else None

    def get_project_name(self, obj):
        return obj.project.name if obj.project_id else None

    def get_user_name(self, obj):
        u = getattr(obj, "user", None)
        return (u.first_name or u.username) if u else None

    def get_progress(self, obj):
        entries = list(obj.time_entries.all())
        total_seconds = sum(
            (e.duration.total_seconds() if e.duration else 0) for e in entries
        )
        return {
            "entries": len(entries),
            "done": sum(1 for e in entries if e.done is True),
            "not_done": sum(1 for e in entries if e.done is False),
            "hours": round(total_seconds / 3600.0, 2),
        }
