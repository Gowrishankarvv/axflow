from __future__ import annotations

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.notify_email import notify
from core.serializers import TicketSerializer
from tables import Ticket, User


def _is_manager(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or getattr(user, "role", "") in ("manager", "superuser"))
    )


def _full_name(u) -> str:
    if not u:
        return ""
    return (u.first_name + " " + u.last_name).strip() or u.username


class TicketViewSet(viewsets.ModelViewSet):
    """Bug + feature ticketing. Submitters see their own; managers/superusers
    see all. Status updates are manager-only (via the `update_status` action)."""
    serializer_class = TicketSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ["get", "post", "delete", "head", "options"]  # status updates go through the action

    def get_queryset(self):
        user = self.request.user
        qs = Ticket.objects.select_related("created_by", "resolved_by").all()
        if _is_manager(user):
            return qs.order_by("-created_at")
        return qs.filter(created_by=user).order_by("-created_at")

    def perform_create(self, serializer):
        ticket: Ticket = serializer.save(created_by=self.request.user)
        # Tell all managers + superusers a fresh ticket landed.
        recipients = User.objects.filter(is_active=True).filter(
            role__in=("manager", "superuser"),
        )
        link = "/tickets"
        for m in recipients:
            if m.id == self.request.user.id:
                continue
            notify(
                user=m,
                actor=self.request.user,
                kind="request_submitted",  # reuse existing kind to avoid migration
                title=f"New {ticket.get_kind_display().lower()}: {ticket.title}",
                message=(
                    f'{_full_name(self.request.user)} raised a {ticket.get_kind_display().lower()} ticket: '
                    f'"{ticket.title}".'
                ),
                link=link,
                send_email=False,  # in-app only -- avoid mass mail on every ticket
            )

    def destroy(self, request, *args, **kwargs):
        ticket = self.get_object()
        # Submitters can delete their own *open* tickets; managers can delete any.
        if not _is_manager(request.user):
            if ticket.created_by_id != request.user.id:
                return Response({"detail": "Forbidden"}, status=403)
            if ticket.status != "open":
                return Response({"detail": "You can only delete a ticket while it is still open."}, status=400)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="update_status")
    def update_status(self, request, pk=None):
        if not _is_manager(request.user):
            return Response({"detail": "Forbidden"}, status=403)
        ticket: Ticket = self.get_object()
        new_status = (request.data.get("status") or "").strip()
        note = (request.data.get("resolution_note") or "").strip()

        valid = {s for s, _ in Ticket.STATUS_CHOICES}
        if new_status not in valid:
            return Response({"status": f"Must be one of {sorted(valid)}"}, status=400)

        old_status = ticket.status
        ticket.status = new_status
        if note:
            ticket.resolution_note = note
        if new_status in ("resolved", "closed") and old_status not in ("resolved", "closed"):
            ticket.resolved_by = request.user
            ticket.resolved_at = timezone.now()
        ticket.save()

        # Notify the original submitter that something moved.
        if ticket.created_by_id != request.user.id:
            notify(
                user=ticket.created_by,
                actor=request.user,
                kind="request_submitted",
                title=f"Ticket {ticket.get_status_display().lower()}: {ticket.title}",
                message=(
                    f'Your ticket "{ticket.title}" is now {ticket.get_status_display().lower()} '
                    f"(updated by {_full_name(request.user)})."
                    + (f' Note: "{note}"' if note else "")
                ),
                link="/tickets",
            )

        return Response(TicketSerializer(ticket, context={"request": request}).data)
