from __future__ import annotations

from django.db import transaction
from rest_framework import viewsets

from tables import Lead, User
from core.permissions import IsManager
from core.serializers import LeadSerializer


class LeadViewSet(viewsets.ModelViewSet):
    serializer_class = LeadSerializer
    permission_classes = [IsManager]
    queryset = Lead.objects.all()

    def get_queryset(self):
        qs = Lead.objects.all().select_related("assigned_to", "created_by")
        params = self.request.query_params
        status = params.get("status")
        if status:
            qs = qs.filter(status=status)
        source = params.get("source")
        if source:
            qs = qs.filter(source=source)
        search = params.get("search")
        if search:
            qs = qs.filter(name__icontains=search)
        return qs.order_by("-date", "-created_at")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_destroy(self, instance: Lead) -> None:
        # The CRM is the source of truth for converted leads: deleting the lead
        # should also remove the Client record it spawned (and any client login
        # users tied to that Client) so the two modules stay in sync.
        with transaction.atomic():
            client = instance.client
            if client is not None:
                User.objects.filter(client_org=client, role="client").delete()
                client.delete()
            instance.delete()
