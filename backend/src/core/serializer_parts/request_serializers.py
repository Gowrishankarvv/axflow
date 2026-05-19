from rest_framework import serializers

from tables import DataRequest, Invoice, InvoiceItem, RequestFile


class RequestFileSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = RequestFile
        fields = ["id", "file", "file_url", "created_at"]

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None


class DataRequestSerializer(serializers.ModelSerializer):
    requester_name = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    estimated_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    files = RequestFileSerializer(many=True, read_only=True)

    class Meta:
        model = DataRequest
        fields = [
            "id",
            "project",
            "project_name",
            "requester",
            "requester_name",
            "title",
            "description",
            "file",
            "file_url",
            "files",
            "status",
            "estimated_cost",
            "estimation_notes",
            "estimated_by",
            "estimated_by_name",
            "estimated_at",
            "approved_at",
            "approved_by",
            "approved_by_name",
            "task",
            "created_at",
            "updated_at",
            "analysis_outlet_count",
            "analysis_image_count",
            "auto_estimated_cost_inr",
        ]
        read_only_fields = [
            "requester",
            "status",
            "estimated_cost",
            "estimation_notes",
            "estimated_by",
            "estimated_at",
            "approved_at",
            "approved_by",
            "task",
            "created_at",
            "updated_at",
            "analysis_outlet_count",
            "analysis_image_count",
            "auto_estimated_cost_inr",
            "files",
        ]

    def get_requester_name(self, obj):
        u = obj.requester
        return (u.first_name or u.username) if u else None

    def get_project_name(self, obj):
        p = obj.project
        return p.name if p else None

    def get_estimated_by_name(self, obj):
        u = obj.estimated_by
        return (u.first_name or u.username) if u else None

    def get_approved_by_name(self, obj):
        u = obj.approved_by
        return (u.first_name or u.username) if u else None

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None

    def create(self, validated_data):
        user = self.context["request"].user
        validated_data["requester"] = user
        return super().create(validated_data)


class InvoiceItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceItem
        fields = ["id", "description", "quantity", "rate", "amount"]
        read_only_fields = ["amount"]


class InvoiceSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    client_name = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    file_url = serializers.SerializerMethodField()
    items = InvoiceItemSerializer(many=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "invoice_number", "client", "client_name", "project", "project_name",
            "status", "status_display", "currency", "notes", "issue_date", "due_date",
            "billing_period", "subtotal", "total", "items",
            "file", "file_url", "uploaded_by", "uploaded_by_name",
            "paid_marked_at", "completed_at", "created_at",
        ]
        read_only_fields = [
            "invoice_number", "status", "subtotal", "total", "file", "uploaded_by",
            "paid_marked_at", "completed_at", "created_at",
        ]

    def get_uploaded_by_name(self, obj):
        u = obj.uploaded_by
        return (u.first_name or u.username) if u else None

    def get_client_name(self, obj):
        return obj.client.name if obj.client_id else None

    def get_project_name(self, obj):
        return obj.project.name if obj.project_id else None

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one line item is required.")
        return value

    def create(self, validated_data):
        items = validated_data.pop("items", [])
        user = self.context["request"].user
        validated_data["uploaded_by"] = user
        invoice = Invoice.objects.create(**validated_data)
        for item in items:
            InvoiceItem.objects.create(invoice=invoice, **item)
        invoice.recalc_totals()
        invoice.save(update_fields=["subtotal", "total"])
        return invoice
