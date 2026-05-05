from __future__ import annotations

from typing import cast

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.selectors import build_visible_user_ids
from apps.core.serializers import UserSerializer
from tables import User


class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["role", "manager"]
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

    def perform_create(self, serializer):
        instance: User = serializer.save()
        if not instance.username:
            instance.username = instance.email
            instance.save(update_fields=["username"])

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
