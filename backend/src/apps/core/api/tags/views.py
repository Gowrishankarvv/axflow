from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.filters import OrderingFilter
from rest_framework.permissions import IsAuthenticated

from tables import Tag
from core.serializers import TagSerializer


class TagViewSet(viewsets.ModelViewSet):
    serializer_class = TagSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["category", "is_active"]
    ordering_fields = ["category", "name"]

    def get_queryset(self):
        return Tag.objects.filter(is_active=True).order_by("category", "name")
