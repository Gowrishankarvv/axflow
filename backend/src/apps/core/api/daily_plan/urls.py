from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import DailyPlanItemViewSet

router = DefaultRouter()
router.register(r"daily-plan", DailyPlanItemViewSet, basename="daily-plan")

urlpatterns = [
    path("", include(router.urls)),
]
