from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import EmployeeSalaryViewSet

router = DefaultRouter()
router.register(r"salary/records", EmployeeSalaryViewSet, basename="salary-record")

urlpatterns = [
    path("", include(router.urls)),
]
