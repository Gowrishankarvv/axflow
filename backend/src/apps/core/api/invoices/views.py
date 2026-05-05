from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.filters import OrderingFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle

from tables import Invoice
from core.serializers import InvoiceSerializer


class InvoiceViewSet(viewsets.ModelViewSet):
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated]
    queryset = Invoice.objects.select_related("client", "project", "uploaded_by").order_by("-billing_period")
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
