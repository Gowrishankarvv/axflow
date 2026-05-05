from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ClockSessionViewSet

router = DefaultRouter()
router.register(r'clock-sessions', ClockSessionViewSet, basename='clocksession')

urlpatterns = [
    path('', include(router.urls)),
]
