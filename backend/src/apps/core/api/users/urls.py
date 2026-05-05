from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import LightUsersView, UserViewSet

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')

urlpatterns = [
    path('users/light/', LightUsersView.as_view(), name='users-light'),
    path('', include(router.urls)),
]
