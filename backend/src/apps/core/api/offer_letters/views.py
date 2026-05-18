from __future__ import annotations

from typing import cast

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.mail import EmailMessage
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter
from rest_framework.parsers import JSONParser
from rest_framework.response import Response

from apps.core.offer_letter_pdf import build_offer_letter_pdf, default_offer_content
from core.models import OfferLetter
from core.permissions import IsManager
from core.serializers import OfferLetterSerializer
from tables import User


def _is_manager(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or getattr(user, "role", "") in ("manager", "superuser"))
    )


class OfferLetterViewSet(viewsets.ModelViewSet):
    """Generate the 3-page Axinor offer-letter PDF from structured content and
    email it to an existing user.

    Manager/superuser-only. Each POST renders the PDF server-side, creates an
    OfferLetter row AND immediately sends the email via Django's configured
    SMTP backend. Failures are recorded on the row (status='failed').
    """
    serializer_class = OfferLetterSerializer
    permission_classes = [IsManager]
    parser_classes = [JSONParser]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["status", "recipient"]
    ordering_fields = ["sent_at"]
    http_method_names = ["get", "post", "head", "options"]  # disallow PUT/PATCH/DELETE

    def get_queryset(self):
        user = cast(User, self.request.user)
        if not _is_manager(user):
            return OfferLetter.objects.none()
        return OfferLetter.objects.select_related("recipient", "sent_by").all()

    def create(self, request, *args, **kwargs):
        user = cast(User, request.user)
        if not _is_manager(user):
            return Response({"detail": "Forbidden"}, status=403)

        recipient_id = request.data.get("recipient")  # field name matches model
        subject = (request.data.get("subject") or "").strip()
        body = (request.data.get("body") or "").strip()
        content = request.data.get("content") or {}

        if not recipient_id:
            return Response({"detail": "recipient is required"}, status=400)
        if not subject:
            return Response({"detail": "subject is required"}, status=400)
        if not body:
            return Response({"detail": "body is required"}, status=400)
        if not isinstance(content, dict) or not content:
            return Response({"detail": "offer letter content is required"}, status=400)
        if not (content.get("recipient_name") or "").strip():
            return Response({"detail": "Recipient name (on the letter) is required"}, status=400)

        try:
            recipient = User.objects.get(pk=recipient_id)
        except User.DoesNotExist:
            return Response({"detail": "Recipient user not found"}, status=400)
        if not recipient.email:
            return Response({"detail": "Recipient has no email on file"}, status=400)

        # Render the 3-page PDF from the submitted content.
        try:
            pdf_bytes = build_offer_letter_pdf(content)
        except Exception as exc:
            return Response(
                {"detail": f"Failed to generate the offer letter PDF: {exc}"},
                status=400,
            )

        safe_name = (
            (content.get("recipient_name") or recipient.username)
            .strip().replace(" ", "_").replace("/", "-")
        )
        filename = f"Offer_Letter_{safe_name}_{timezone.now():%Y%m%d}.pdf"

        # Persist the row; the generated PDF is written to storage.
        offer = OfferLetter.objects.create(
            recipient=recipient,
            recipient_email_snapshot=recipient.email,
            recipient_name_snapshot=recipient.first_name or recipient.username,
            subject=subject,
            body=body,
            content=content,
            attachment=ContentFile(pdf_bytes, name=filename),
            sent_by=user,
            status="sent",
        )

        try:
            file_bytes = pdf_bytes

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
        """Prefill the form: the email subject/body plus the structured
        offer-letter content (exact template wording, blank variable fields).

        Frontend substitutes `{name}` in the email body with the recipient's
        first name.
        """
        return Response({
            "subject": "Offer of Employment — AXINOR TECHNOLOGIES",
            "body": (
                "Dear {name},\n\n"
                "We are delighted to extend you an offer of employment with "
                "AXINOR TECHNOLOGIES. Please find your formal offer letter attached.\n\n"
                "Kindly review the terms and confirm your acceptance by replying to "
                "this email. If you have any questions, feel free to reach out.\n\n"
                "Best regards,\n"
                "AXINOR TECHNOLOGIES HR Team"
            ),
            "content": default_offer_content(),
        })
