from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import TaskExtensionRequestViewSet

router = DefaultRouter()
router.register(r'extension-requests', TaskExtensionRequestViewSet, basename='extension-request')

urlpatterns = [
    path('', include(router.urls)),
]
