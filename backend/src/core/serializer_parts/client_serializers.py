from django.db import transaction
from rest_framework import serializers

from tables import Client, User


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = [
            "id",
            "name",
            "domain",
            "contact_email",
            "logo",
            "is_active",
            "created_at",
            "admin_email",
            "admin_name",
            "admin_password",
            "delete_logo",
        ]
        read_only_fields = ["created_at"]

    admin_email = serializers.EmailField(write_only=True, required=False)
    admin_name = serializers.CharField(write_only=True, required=False)
    admin_password = serializers.CharField(write_only=True, required=False)
    delete_logo = serializers.BooleanField(write_only=True, required=False)

    def update(self, instance, validated_data):
        delete_logo = validated_data.pop("delete_logo", False)
        if delete_logo:
             instance.logo = None
        return super().update(instance, validated_data)

    @transaction.atomic
    def create(self, validated_data):
        validated_data.pop("delete_logo", None) # Remove it if present, though it's not relevant for create usually
        admin_email = validated_data.pop("admin_email", "")
        admin_name = validated_data.pop("admin_name", "")
        admin_password = validated_data.pop("admin_password", "")

        client = super().create(validated_data)

        if admin_email and admin_password:
            if User.objects.filter(email=admin_email).exists():
                raise serializers.ValidationError({"admin_email": "User with this email already exists."})

            first_name = admin_name.split(" ")[0] if admin_name else ""
            last_name = " ".join(admin_name.split(" ")[1:]) if admin_name and " " in admin_name else ""

            User.objects.create_user(
                username=admin_email,
                email=admin_email,
                password=admin_password,
                first_name=first_name,
                last_name=last_name,
                role="client",
                client_org=client,
                is_active=True,
            )

        return client
