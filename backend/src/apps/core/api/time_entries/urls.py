from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import TimeEntryViewSet

router = DefaultRouter()
router.register(r'time-entries', TimeEntryViewSet, basename='timeentry')

urlpatterns = [
    path('', include(router.urls)),
]
