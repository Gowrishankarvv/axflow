from __future__ import annotations

import secrets
import string

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from tables import Client, Lead, User


def _generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


class LeadSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    referred_by_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    source_display = serializers.CharField(source="get_source_display", read_only=True)
    lead_type_display = serializers.CharField(source="get_lead_type_display", read_only=True)
    work_type_display = serializers.CharField(source="get_work_type_display", read_only=True)
    invoice_status_display = serializers.CharField(source="get_invoice_status_display", read_only=True)
    # Surfaces the linked client to the frontend after conversion.
    client_id = serializers.IntegerField(source="client.id", read_only=True)
    client_record_name = serializers.CharField(source="client.name", read_only=True)
    # Returned only on the request that triggers conversion -- never persisted.
    generated_temp_password = serializers.CharField(read_only=True, required=False)

    class Meta:
        model = Lead
        fields = [
            "id",
            "date",
            "name",
            "contact_details",
            "source",
            "source_display",
            "lead_type",
            "lead_type_display",
            "work_type",
            "work_type_display",
            "enquiry_video_link",
            "requirements",
            "remarks",
            "suggestion",
            "reason_not_proceed",
            "assigned_to",
            "assigned_to_name",
            "referred_by",
            "referred_by_name",
            "last_followed_up",
            "status",
            "status_display",
            "status_description",
            "invoice_status",
            "invoice_status_display",
            "invoice_amount",
            "invoice_date",
            "invoice_notes",
            "invoice_file_url",
            # Client provisioning fields
            "client_name",
            "client_domain",
            "client_contact_email",
            "client_admin_name",
            "client_admin_email",
            "client",
            "client_id",
            "client_record_name",
            "generated_temp_password",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_by", "created_at", "updated_at", "client"]

    def get_assigned_to_name(self, obj):
        u = obj.assigned_to
        if not u:
            return None
        return (u.first_name + " " + u.last_name).strip() or u.username

    def get_referred_by_name(self, obj):
        u = obj.referred_by
        if not u:
            return None
        return (u.first_name + " " + u.last_name).strip() or u.username

    def validate(self, attrs):
        lead_type = attrs.get("lead_type", getattr(self.instance, "lead_type", None))
        # `referred_by` is only meaningful for employee referrals; require it then.
        referred_by = attrs.get("referred_by", getattr(self.instance, "referred_by", None))
        if lead_type == "employee_referral" and not referred_by:
            raise serializers.ValidationError({
                "referred_by": "Select the employee who referred this lead.",
            })
        if lead_type != "employee_referral" and "referred_by" not in attrs and self.instance is None:
            # On create with a non-referral type, leave referred_by null.
            pass
        return attrs

    def get_created_by_name(self, obj):
        u = obj.created_by
        if not u:
            return None
        return (u.first_name + " " + u.last_name).strip() or u.username

    def _maybe_convert(self, lead: Lead) -> Lead:
        """If the lead just flipped to 'converted' and has no linked client,
        create the Client (and optionally an admin User) inside an atomic block.
        Stashes a temp password on the instance for one-shot return to the UI.
        """
        if lead.status != "converted" or lead.client_id:
            return lead

        client_name = (lead.client_name or lead.name or "").strip()
        if not client_name:
            raise serializers.ValidationError({
                "client_name": "Required to convert a lead -- set a company name first.",
            })

        with transaction.atomic():
            client = Client.objects.create(
                name=client_name,
                domain=lead.client_domain or "",
                contact_email=lead.client_contact_email or "",
                is_active=True,
            )
            lead.client = client

            temp_password = ""
            admin_email = lead.client_admin_email
            if admin_email:
                if (
                    User.objects.filter(email__iexact=admin_email).exists()
                    or User.objects.filter(username__iexact=admin_email).exists()
                ):
                    raise serializers.ValidationError({
                        "client_admin_email": (
                            "A user with this email already exists. "
                            "Skip the admin email here and add the login manually from the Clients page."
                        ),
                    })

                full_name = (lead.client_admin_name or "").strip()
                first_name = full_name.split(" ", 1)[0] if full_name else ""
                last_name = full_name.split(" ", 1)[1] if " " in full_name else ""
                temp_password = _generate_temp_password()

                try:
                    User.objects.create_user(
                        username=admin_email,
                        email=admin_email,
                        password=temp_password,
                        first_name=first_name,
                        last_name=last_name,
                        role="client",
                        client_org=client,
                        is_active=True,
                        must_set_password=True,
                    )
                except DjangoValidationError as exc:
                    detail = getattr(exc, "message_dict", None) or {"detail": exc.messages}
                    raise serializers.ValidationError({"client_admin_email": detail})

            lead.save(update_fields=["client"])

            if temp_password:
                # Carried back to the response only -- never written to DB.
                lead.generated_temp_password = temp_password  # type: ignore[attr-defined]
        return lead

    def create(self, validated_data):
        lead = super().create(validated_data)
        return self._maybe_convert(lead)

    def update(self, instance, validated_data):
        lead = super().update(instance, validated_data)
        return self._maybe_convert(lead)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Pass the one-shot temp password through, then forget it.
        temp = getattr(instance, "generated_temp_password", None)
        if temp:
            data["generated_temp_password"] = temp
        else:
            data.pop("generated_temp_password", None)
        return data
