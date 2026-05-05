from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import DataRequestViewSet

router = DefaultRouter()
router.register(r'requests', DataRequestViewSet, basename='request')

urlpatterns = [
    path('', include(router.urls)),
]
