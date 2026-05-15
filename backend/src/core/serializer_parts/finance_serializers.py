from __future__ import annotations

from rest_framework import serializers

from core.models import MiscExpense, ProjectBudget, SalaryPayment, Transaction


class TransactionSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    category_label = serializers.SerializerMethodField()

    class Meta:
        model = Transaction
        fields = [
            "id", "flow", "category", "category_label",
            "amount", "currency",
            "description", "note",
            "occurred_on",
            "project", "project_name",
            "created_by", "created_by_name",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "created_by", "created_by_name", "project_name",
            "category_label", "created_at", "updated_at",
        ]

    def get_created_by_name(self, obj):
        u = obj.created_by
        return (u.first_name or u.username) if u else None

    def get_project_name(self, obj):
        return obj.project.name if obj.project else None

    def get_category_label(self, obj):
        return obj.get_category_display()


class MiscExpenseSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MiscExpense
        fields = [
            "id", "spent_for", "amount", "note", "occurred_on",
            "transaction",
            "created_by", "created_by_name", "created_at",
        ]
        read_only_fields = [
            "transaction", "created_by", "created_by_name", "created_at",
        ]

    def get_created_by_name(self, obj):
        u = obj.created_by
        return (u.first_name or u.username) if u else None


class SalaryPaymentSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    processed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = SalaryPayment
        fields = [
            "id", "employee", "employee_name",
            "amount", "period_month", "period_year", "note",
            "status",
            "employee_response_at", "employee_response_note",
            "processed_by", "processed_by_name", "processed_at",
            "transaction",
        ]
        read_only_fields = [
            "status", "employee_response_at", "employee_response_note",
            "processed_by", "processed_by_name", "processed_at",
            "employee_name", "transaction",
        ]

    def get_employee_name(self, obj):
        u = obj.employee
        return (u.first_name or u.username) if u else None

    def get_processed_by_name(self, obj):
        u = obj.processed_by
        return (u.first_name or u.username) if u else None


class ProjectBudgetSerializer(serializers.ModelSerializer):
    project_name = serializers.SerializerMethodField()
    actual_spend = serializers.SerializerMethodField()
    remaining = serializers.SerializerMethodField()

    class Meta:
        model = ProjectBudget
        fields = [
            "id", "project", "project_name",
            "planned_amount", "currency", "note",
            "actual_spend", "remaining",
            "created_by", "created_at", "updated_at",
        ]
        read_only_fields = [
            "project_name", "actual_spend", "remaining",
            "created_by", "created_at", "updated_at",
        ]

    def get_project_name(self, obj):
        return obj.project.name if obj.project else None

    def get_actual_spend(self, obj):
        spent = 0
        for t in Transaction.objects.filter(project=obj.project, flow="expense"):
            spent += float(t.amount)
        return spent

    def get_remaining(self, obj):
        return float(obj.planned_amount) - self.get_actual_spend(obj)
