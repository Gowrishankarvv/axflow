from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import AuthMeView, CheckNewUserView, LoginView, LogoutView, SetNewPasswordView, SetPasswordView

urlpatterns = [
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    path('auth/set-password/', SetPasswordView.as_view(), name='set-password'),
    path('auth/check-new-user/', CheckNewUserView.as_view(), name='check-new-user'),
    path('auth/set-new-password/', SetNewPasswordView.as_view(), name='set-new-password'),
    path('auth/me/', AuthMeView.as_view(), name='auth-me'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]
