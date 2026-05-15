from __future__ import annotations

from rest_framework import viewsets

from core.permissions import IsManager
from core.serializers import ProjectCredentialSerializer
from tables import ProjectCredential


class ProjectCredentialViewSet(viewsets.ModelViewSet):
    """Plain-text project credential storage. Manager/superuser only."""
    serializer_class = ProjectCredentialSerializer
    permission_classes = [IsManager]
    queryset = ProjectCredential.objects.all()

    def get_queryset(self):
        qs = ProjectCredential.objects.select_related("project", "created_by").all()
        project_id = self.request.query_params.get("project")
        if project_id:
            qs = qs.filter(project_id=project_id)
        return qs.order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
