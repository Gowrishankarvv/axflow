from __future__ import annotations

from rest_framework import serializers

from core.models import EmployeeSalary


class EmployeeSalarySerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeSalary
        fields = [
            "id", "employee", "employee_name",
            "amount", "currency", "effective_from", "note",
            "created_by", "created_by_name",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "employee_name", "created_by", "created_by_name",
            "created_at", "updated_at",
        ]

    def get_employee_name(self, obj):
        u = obj.employee
        return (u.first_name or u.username) if u else None

    def get_created_by_name(self, obj):
        u = obj.created_by
        return (u.first_name or u.username) if u else None
