from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ProjectCredentialViewSet

router = DefaultRouter()
router.register(r'credentials', ProjectCredentialViewSet, basename='project-credential')

urlpatterns = [
    path('', include(router.urls)),
]
