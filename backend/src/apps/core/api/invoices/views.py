from __future__ import annotations

import logging

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.mail import EmailMessage
from django.db.models import Q
from django.http import FileResponse
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status as drf_status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.filters import OrderingFilter
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.core.invoice_pdf import render_invoice_pdf
from core.notify_email import notify
from core.permissions import IsManagerOrClient, is_executive
from core.models import Transaction
from core.serializers import InvoiceSerializer
from tables import Invoice, User

logger = logging.getLogger(__name__)


def _is_privileged(user) -> bool:
    """Superuser or executive — the people who issue / complete invoices."""
    return bool(user and user.is_authenticated and is_executive(user))


def _privileged_recipients():
    """Every superuser + executive who should hear about payment activity."""
    from core.permissions import EXECUTIVE_POSITIONS

    return User.objects.filter(is_active=True).filter(
        Q(is_superuser=True) | Q(role="superuser") | Q(position__in=EXECUTIVE_POSITIONS)
    ).distinct()


def _client_users(invoice: Invoice):
    """Account users that belong to the invoice's client org."""
    if not invoice.client_id:
        return User.objects.none()
    return User.objects.filter(is_active=True, role="client", client_org_id=invoice.client_id)


def _email_invoice(invoice: Invoice, *, subject: str, body: str) -> None:
    """Email the generated PDF to the client (org contact + account users).

    Failures are logged, never raised — the in-app record is the source of
    truth.
    """
    try:
        from_email = settings.DEFAULT_FROM_EMAIL or settings.EMAIL_HOST_USER
        if not from_email:
            logger.info("invoice email skipped (no DEFAULT_FROM_EMAIL configured)")
            return

        recipients = set()
        contact = getattr(invoice.client, "contact_email", "") or ""
        if contact:
            recipients.add(contact)
        recipients.update(
            u.email for u in _client_users(invoice) if u.email
        )
        if not recipients:
            logger.info("invoice %s: no client email on file", invoice.invoice_number)
            return

        if not invoice.file:
            invoice.file.save(
                f"{invoice.invoice_number}.pdf",
                ContentFile(render_invoice_pdf(invoice)),
                save=True,
            )

        msg = EmailMessage(
            subject=subject, body=body, from_email=from_email, to=sorted(recipients),
        )
        invoice.file.open("rb")
        try:
            msg.attach(f"{invoice.invoice_number}.pdf", invoice.file.read(), "application/pdf")
        finally:
            invoice.file.close()
        msg.send(fail_silently=False)
    except Exception:  # pragma: no cover - SMTP/env specific
        logger.exception("invoice %s: email send failed", invoice.invoice_number)


class InvoiceViewSet(viewsets.ModelViewSet):
    serializer_class = InvoiceSerializer
    # Managers/superusers see all; clients see only their own; employees blocked.
    permission_classes = [IsManagerOrClient]
    queryset = (
        Invoice.objects.select_related("client", "project", "uploaded_by")
        .prefetch_related("items")
        .order_by("-created_at")
    )
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "client_list"
    filter_backends = [DjangoFilterBackend, OrderingFilter]

    def get_queryset(self):
        user = self.request.user
        qs = self.queryset
        if user.role == "client":
            if user.client_org:
                return qs.filter(client=user.client_org)
            return qs.none()
        return qs

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        if getattr(request.user, "role", None) == "client":
            response["Cache-Control"] = "private, max-age=60, stale-while-revalidate=120"
        return response

    # --- Creation: only privileged users issue invoices ------------------
    def create(self, request, *args, **kwargs):
        if not _is_privileged(request.user) and request.user.role != "manager":
            raise PermissionDenied("Only managers, executives or superusers can issue invoices.")
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice = serializer.save()

        # Generate + persist the PDF, then deliver it.
        invoice.file.save(
            f"{invoice.invoice_number}.pdf",
            ContentFile(render_invoice_pdf(invoice)),
            save=True,
        )

        _email_invoice(
            invoice,
            subject=f"Invoice {invoice.invoice_number} from AXFLOW — Payment Requested",
            body=(
                f"Dear {invoice.client.name},\n\n"
                f"Please find attached invoice {invoice.invoice_number} for "
                f"{invoice.currency} {invoice.total}.\n\n"
                "You can also view and download it, and mark it as paid, from your "
                "AXFLOW invoices page.\n\nThank you."
            ),
        )
        for cu in _client_users(invoice):
            notify(
                user=cu,
                kind="invoice_issued",
                title=f"New invoice {invoice.invoice_number}",
                message=(
                    f"A payment of {invoice.currency} {invoice.total} has been "
                    f"requested for {invoice.client.name}. Open Invoices to view, "
                    "download and mark it paid."
                ),
                link="/invoices",
                actor=request.user,
            )

        out = self.get_serializer(invoice)
        return Response(out.data, status=drf_status.HTTP_201_CREATED)

    # --- Download the PDF (privileged or owning client) ------------------
    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        invoice = self.get_object()
        user = request.user
        is_owner_client = (
            user.role == "client" and user.client_org_id == invoice.client_id
        )
        if not (_is_privileged(user) or is_owner_client):
            raise PermissionDenied("You cannot download this invoice.")

        if not invoice.file:
            invoice.file.save(
                f"{invoice.invoice_number}.pdf",
                ContentFile(render_invoice_pdf(invoice)),
                save=True,
            )
        invoice.file.open("rb")
        return FileResponse(
            invoice.file,
            as_attachment=True,
            filename=f"{invoice.invoice_number}.pdf",
            content_type="application/pdf",
        )

    # --- Client marks the invoice paid -----------------------------------
    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        invoice = self.get_object()
        user = request.user
        if not (user.role == "client" and user.client_org_id == invoice.client_id):
            raise PermissionDenied("Only the client can mark this invoice paid.")
        if invoice.status != "requested":
            raise ValidationError(f"Invoice is already '{invoice.get_status_display()}'.")

        invoice.status = "paid"
        invoice.paid_marked_at = timezone.now()
        invoice.paid_marked_by = user
        invoice.save(update_fields=["status", "paid_marked_at", "paid_marked_by"])

        for rcpt in _privileged_recipients():
            notify(
                user=rcpt,
                kind="invoice_paid",
                title=f"Invoice {invoice.invoice_number} marked paid",
                message=(
                    f"{invoice.client.name} marked invoice {invoice.invoice_number} "
                    f"({invoice.currency} {invoice.total}) as paid. Review and mark "
                    "it completed to post the income."
                ),
                link="/invoices",
                actor=user,
            )
        return Response(self.get_serializer(invoice).data)

    # --- Privileged user completes payment -> posts income ---------------
    @action(detail=True, methods=["post"], url_path="mark-completed")
    def mark_completed(self, request, pk=None):
        invoice = self.get_object()
        user = request.user
        if not _is_privileged(user):
            raise PermissionDenied("Only executives or superusers can complete payment.")
        if invoice.status != "paid":
            raise ValidationError(
                "Invoice must be marked paid by the client before completion."
            )

        invoice.status = "completed"
        invoice.completed_at = timezone.now()
        invoice.completed_by = user

        # Post the income — tagged to the project so the project's income
        # (Finance) reflects it too.
        if invoice.transaction is None:
            txn = Transaction.objects.create(
                flow="income",
                category="income",
                amount=invoice.total,
                currency=invoice.currency,
                description=f"Invoice {invoice.invoice_number} — {invoice.client.name}",
                project=invoice.project,
                created_by=user,
            )
            invoice.transaction = txn

        invoice.save(update_fields=["status", "completed_at", "completed_by", "transaction"])

        # Regenerate the PDF so it now reads "PAID — COMPLETED", then redeliver.
        invoice.file.save(
            f"{invoice.invoice_number}.pdf",
            ContentFile(render_invoice_pdf(invoice)),
            save=True,
        )
        _email_invoice(
            invoice,
            subject=f"Invoice {invoice.invoice_number} — Payment Completed",
            body=(
                f"Dear {invoice.client.name},\n\n"
                f"Your payment for invoice {invoice.invoice_number} "
                f"({invoice.currency} {invoice.total}) has been received and "
                "completed. The updated invoice is attached.\n\nThank you."
            ),
        )
        for cu in _client_users(invoice):
            notify(
                user=cu,
                kind="invoice_completed",
                title=f"Invoice {invoice.invoice_number} completed",
                message=(
                    f"Payment for invoice {invoice.invoice_number} "
                    f"({invoice.currency} {invoice.total}) is completed. The "
                    "receipt is in your Invoices page."
                ),
                link="/invoices",
                actor=user,
            )
        return Response(self.get_serializer(invoice).data)
