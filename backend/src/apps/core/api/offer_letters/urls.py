from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import OfferLetterViewSet

router = DefaultRouter()
router.register(r'offer-letters', OfferLetterViewSet, basename='offerletter')

urlpatterns = [
    path('', include(router.urls)),
]
