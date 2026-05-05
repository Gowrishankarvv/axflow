from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.core.api.app_init.views import ProjectsCombinedView

from .views import ProjectAssignmentViewSet, ProjectViewSet

router = DefaultRouter()
router.register(r'projects', ProjectViewSet, basename='project')
router.register(r'assignments', ProjectAssignmentViewSet, basename='assignment')

urlpatterns = [
    path('projects/combined/', ProjectsCombinedView.as_view(), name='projects-combined'),
    path('', include(router.urls)),
]
