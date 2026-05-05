from django.db import transaction
from rest_framework import serializers

from tables import Project, ProjectAssignment, Task, TaskAssignment, User


class ProjectSerializer(serializers.ModelSerializer):
    assignees = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False)
    assigned_user_names = serializers.SerializerMethodField(read_only=True)
    monthly_threshold_hours = serializers.DecimalField(max_digits=8, decimal_places=2, required=False)
    threshold_hours = serializers.DecimalField(
        source="monthly_threshold_hours", max_digits=8, decimal_places=2, required=False
    )
    client_name = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            "id",
            "name",
            "description",
            "start_date",
            "end_date",
            "due_date",
            "monthly_threshold_hours",
            "threshold_hours",
            "created_by",
            "created_at",
            "assignees",
            "assigned_user_names",
            "billable",
            "client",
            "client_name",
        ]
        read_only_fields = ["created_by", "created_at", "assigned_user_names"]

    def get_assigned_user_names(self, obj):
        return [
            f"{a.assignee.first_name} {a.assignee.last_name}".strip() or a.assignee.username
            for a in obj.projectassignment_set.all().select_related("assignee")
        ]

    def get_client_name(self, obj):
        return obj.client.name if obj.client else None

    def validate(self, attrs):
        start_date = attrs.get("start_date") or getattr(self.instance, "start_date", None)
        end_date = attrs.get("end_date") or getattr(self.instance, "end_date", None)
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({"end_date": "End date cannot be before start date."})
        return super().validate(attrs)

    def _apply_assignees(self, project, assignee_ids):
        if assignee_ids is None:
            return
        existing = set(ProjectAssignment.objects.filter(project=project).values_list("assignee_id", flat=True))
        desired = set(assignee_ids)
        to_add = desired - existing
        to_remove = existing - desired
        if to_remove:
            ProjectAssignment.objects.filter(project=project, assignee_id__in=to_remove).delete()
        for uid in to_add:
            if User.objects.filter(id=uid).exists():
                ProjectAssignment.objects.create(project=project, assignee_id=uid, assigned_by=self.context["request"].user)

    def create(self, validated_data):
        assignees = validated_data.pop("assignees", None)
        project = super().create(validated_data)
        self._apply_assignees(project, assignees)
        return project

    def update(self, instance, validated_data):
        assignees = validated_data.pop("assignees", None)
        project = super().update(instance, validated_data)
        self._apply_assignees(project, assignees)
        return project


class ProjectAssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectAssignment
        fields = ["id", "project", "assignee", "assigned_by", "allotted_hours", "start_date", "end_date"]
        read_only_fields = ["assigned_by"]


class TaskAssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskAssignment
        fields = ["id", "task", "assignee", "assigned_by", "allotted_hours", "start_date", "end_date"]
        read_only_fields = ["assigned_by"]


class TaskSerializer(serializers.ModelSerializer):
    assignees = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False)
    assigned_to = serializers.IntegerField(write_only=True, required=False)

    project_name = serializers.SerializerMethodField()
    assigned_user_names = serializers.SerializerMethodField(read_only=True)
    assignees_ids = serializers.SerializerMethodField(read_only=True)
    user_total_hours = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Task
        fields = [
            "id",
            "project",
            "project_name",
            "title",
            "description",
            "assignees",
            "assigned_to",
            "assigned_user_names",
            "assignees_ids",
            "status",
            "created_by",
            "created_at",
            "actual_start_date",
            "planned_start_date",
            "planned_end_date",
            "due_date",
            "user_total_hours",
        ]
        read_only_fields = ["created_by", "created_at", "assigned_user_names", "user_total_hours"]

    def get_user_total_hours(self, obj):
        val = getattr(obj, "user_total_hours", None)
        if val is not None:
            return str(val)
        return "00:00:00"

    def get_project_name(self, obj):
        return obj.project.name

    def get_assigned_user_names(self, obj):
        if hasattr(obj, "assignees") and hasattr(obj.assignees, "all") and getattr(obj.assignees, "prefetch_cache_name", None):
            return [u.first_name or u.username for u in obj.assignees.all()]
        user_qs = (
            TaskAssignment.objects.filter(task=obj)
            .select_related("assignee")
            .values_list("assignee__first_name", "assignee__username")
        )
        return [first or username for first, username in user_qs]

    def get_assignees_ids(self, obj):
        if hasattr(obj, "assignees") and getattr(obj.assignees, "prefetch_cache_name", None):
            return [u.id for u in obj.assignees.all()]
        return list(TaskAssignment.objects.filter(task=obj).values_list("assignee_id", flat=True))

    def _apply_assignees(self, task, assignee_ids):
        if not assignee_ids or "request" not in self.context:
            return
        request_user = self.context["request"].user
        valid_ids = list(User.objects.filter(id__in=assignee_ids).values_list("id", flat=True))
        existing = set(TaskAssignment.objects.filter(task=task).values_list("assignee_id", flat=True))
        desired = set(valid_ids)
        to_add = desired - existing
        to_remove = existing - desired

        if to_remove:
            TaskAssignment.objects.filter(task=task, assignee_id__in=to_remove).delete()

        for uid in to_add:
            TaskAssignment.objects.create(task=task, assignee_id=uid, assigned_by=request_user)

    @transaction.atomic
    def create(self, validated_data):
        assignees = validated_data.pop("assignees", None)
        assigned_to = validated_data.pop("assigned_to", None)
        if assignees is None and assigned_to is not None:
            assignees = [assigned_to]

        task = super().create(validated_data)
        self._apply_assignees(task, assignees)
        return task

    @transaction.atomic
    def update(self, instance, validated_data):
        assignees = validated_data.pop("assignees", None)
        assigned_to = validated_data.pop("assigned_to", None)
        if assignees is None and assigned_to is not None:
            assignees = [assigned_to]

        task = super().update(instance, validated_data)
        if assignees is not None:
            self._apply_assignees(task, assignees)
        return task

    def validate(self, attrs):
        planned_start = attrs.get("planned_start_date") or getattr(self.instance, "planned_start_date", None)
        planned_end = attrs.get("planned_end_date") or getattr(self.instance, "planned_end_date", None)
        if planned_start and planned_end and planned_end < planned_start:
            raise serializers.ValidationError(
                {"planned_end_date": "Planned end date cannot be before planned start date."}
            )
        return super().validate(attrs)

    def get_assigned_to(self, obj):
        first = TaskAssignment.objects.filter(task=obj).order_by("id").values_list("assignee_id", flat=True).first()
        return first if first is not None else None
