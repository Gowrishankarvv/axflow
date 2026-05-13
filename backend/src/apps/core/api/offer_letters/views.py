from __future__ import annotations

from typing import cast

from django.conf import settings
from django.core.mail import EmailMessage
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.models import OfferLetter
from core.serializers import OfferLetterSerializer
from tables import User


def _is_superuser(user) -> bool:
    return bool(user.is_superuser or getattr(user, "role", "") == "superuser")


class OfferLetterViewSet(viewsets.ModelViewSet):
    """Send an offer-letter email to an existing user, with an attachment.

    Superuser-only. Each POST creates an OfferLetter row AND immediately sends
    the email via Django's configured SMTP backend. Failures are recorded on
    the row (status='failed', error_message=...).
    """
    serializer_class = OfferLetterSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["status", "recipient"]
    ordering_fields = ["sent_at"]
    http_method_names = ["get", "post", "head", "options"]  # disallow PUT/PATCH/DELETE

    def get_queryset(self):
        user = cast(User, self.request.user)
        if not _is_superuser(user):
            return OfferLetter.objects.none()
        return OfferLetter.objects.select_related("recipient", "sent_by").all()

    def create(self, request, *args, **kwargs):
        user = cast(User, request.user)
        if not _is_superuser(user):
            return Response({"detail": "Forbidden"}, status=403)

        recipient_id = request.data.get("recipient")  # field name matches model
        subject = (request.data.get("subject") or "").strip()
        body = (request.data.get("body") or "").strip()
        attachment = request.FILES.get("attachment")

        if not recipient_id:
            return Response({"detail": "recipient is required"}, status=400)
        if not subject:
            return Response({"detail": "subject is required"}, status=400)
        if not body:
            return Response({"detail": "body is required"}, status=400)
        if not attachment:
            return Response({"detail": "attachment is required"}, status=400)

        try:
            recipient = User.objects.get(pk=recipient_id)
        except User.DoesNotExist:
            return Response({"detail": "Recipient user not found"}, status=400)
        if not recipient.email:
            return Response({"detail": "Recipient has no email on file"}, status=400)

        # Persist the row first so the attachment is written to storage.
        offer = OfferLetter.objects.create(
            recipient=recipient,
            recipient_email_snapshot=recipient.email,
            recipient_name_snapshot=recipient.first_name or recipient.username,
            subject=subject,
            body=body,
            attachment=attachment,
            sent_by=user,
            status="sent",
        )

        # Read back from saved storage so the email gets a stable copy of the file.
        try:
            offer.attachment.open("rb")
            try:
                file_bytes = offer.attachment.read()
            finally:
                offer.attachment.close()

            from_email = settings.DEFAULT_FROM_EMAIL or settings.EMAIL_HOST_USER
            if not from_email:
                raise RuntimeError("DEFAULT_FROM_EMAIL / EMAIL_HOST_USER is not configured")

            msg = EmailMessage(
                subject=subject,
                body=body,
                from_email=from_email,
                to=[recipient.email],
            )
            msg.attach(
                filename=offer.attachment.name.rsplit("/", 1)[-1],
                content=file_bytes,
            )
            msg.send(fail_silently=False)
        except Exception as exc:  # SMTP errors, missing config, etc.
            offer.status = "failed"
            offer.error_message = str(exc)[:1000]
            offer.save()
            return Response(
                {
                    "detail": f"Email send failed: {exc}",
                    "offer": self.get_serializer(offer, context={"request": request}).data,
                },
                status=502,
            )

        return Response(
            self.get_serializer(offer, context={"request": request}).data,
            status=201,
        )

    @action(detail=False, methods=["get"], url_path="default_template")
    def default_template(self, request):
        """The prefilled subject + body the form should start with.

        Frontend substitutes `{name}` with the chosen recipient's first name.
        """
        return Response({
            "subject": "Offer of Employment — Axinortech",
            "body": (
                "Dear {name},\n\n"
                "We are delighted to extend you an offer of employment with Axinortech. "
                "Please find your formal offer letter attached.\n\n"
                "Kindly review the terms and confirm your acceptance by replying to this email. "
                "If you have any questions, feel free to reach out.\n\n"
                "Best regards,\n"
                "Axinortech HR Team"
            ),
        })
