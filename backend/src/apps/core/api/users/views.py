from __future__ import annotations

from typing import cast

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter
from rest_framework.permissions import BasePermission, IsAuthenticated, SAFE_METHODS
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.selectors import build_visible_user_ids
from apps.core.serializers import UserSerializer
from tables import User


class _UserPermission(BasePermission):
    """Read access stays open (employees see their own record via the existing
    queryset filter). Writes (POST/PATCH/PUT/DELETE) are manager+superuser only,
    so employees can't create/edit other users through the API even if they
    bypass the hidden /admin page."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return bool(
            user.is_superuser or getattr(user, "role", "") in ("manager", "superuser")
        )


class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [_UserPermission]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    # client_org included so the Clients page can ask for
    # /users/?role=client&client_org=<id> to list a single org's logins.
    filterset_fields = ["role", "manager", "client_org"]
    ordering_fields = ["created_at", "first_name", "last_name", "id"]

    def get_queryset(self):
        user = cast(User, self.request.user)
        qs = (
            User.objects.select_related("manager")
            .prefetch_related("direct_reports")
            .all()
            .order_by("-created_at", "-id")
        )
        if user.is_superuser or user.role == "superuser":
            include_inactive = self.request.query_params.get("include_inactive")
            if include_inactive in ("true", "True", "1"):
                return qs
            return qs.filter(is_active=True)
        if user.role == "manager":
            return qs.filter(id__in=build_visible_user_ids(user), is_active=True)
        return qs.filter(id=user.id, is_active=True)

    def create(self, request, *args, **kwargs):
        # Default DRF flow, then bolt on the one-shot generated password so the
        # admin UI can show it in a copy-banner.
        response = super().create(request, *args, **kwargs)
        if response.status_code in (200, 201):
            instance: User | None = getattr(self, "_created_instance", None)
            if instance is not None:
                pwd = getattr(instance, "_generated_password", None)
                if pwd:
                    response.data["generated_password"] = pwd
        return response

    def perform_create(self, serializer):
        instance: User = serializer.save()
        if not instance.username:
            instance.username = instance.email
            instance.save(update_fields=["username"])
        # Stash on self so create() can pluck the transient _generated_password.
        self._created_instance = instance

    def perform_update(self, serializer):
        instance: User = serializer.save()
        if not instance.username:
            instance.username = instance.email
            instance.save(update_fields=["username"])

    @action(detail=False, methods=["get"], url_path="light")
    def light(self, request: Request):
        qs = self.get_queryset().exclude(role="client").only("id", "first_name", "last_name", "username", "role", "position", "manager_id")
        data = list(qs.values("id", "first_name", "last_name", "username", "role", "position", "manager_id"))
        return Response(data)


class LightUsersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request):
        user = cast(User, request.user)
        if user.is_superuser or user.role == "superuser":
            qs = User.objects.filter(is_active=True).exclude(role="client")
        else:
            visible_ids = build_visible_user_ids(user)
            qs = User.objects.filter(id__in=visible_ids, is_active=True).exclude(role="client")
        qs = qs.only("id", "first_name", "last_name", "username", "role", "position", "manager_id")
        data = list(qs.values("id", "first_name", "last_name", "username", "role", "position", "manager_id"))
        return Response(data)
