from django.core.exceptions import ValidationError as DjangoValidationError
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
            # Case-insensitive uniqueness check on both email AND username
            # (we use the email as the username, so a clash on either side blocks).
            if (
                User.objects.filter(email__iexact=admin_email).exists()
                or User.objects.filter(username__iexact=admin_email).exists()
            ):
                raise serializers.ValidationError({
                    "admin_email": "A user with this email already exists. Add a login to the existing client instead, or use a different email."
                })

            first_name = admin_name.split(" ")[0] if admin_name else ""
            last_name = " ".join(admin_name.split(" ")[1:]) if admin_name and " " in admin_name else ""

            try:
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
            except DjangoValidationError as exc:
                # The User model's save() calls full_clean(), which can raise this
                # for race-condition duplicates or domain validation failures.
                # Surface as a DRF 400 rather than a 500.
                detail = getattr(exc, "message_dict", None) or {"detail": exc.messages}
                raise serializers.ValidationError({"admin_email": detail})

        return client
