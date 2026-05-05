from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ClientDashboardSummaryView, ClientViewSet

router = DefaultRouter()
router.register(r'clients', ClientViewSet, basename='client')

urlpatterns = [
    path('client/dashboard/summary/', ClientDashboardSummaryView.as_view(), name='client-dashboard-summary'),
    path('', include(router.urls)),
]
