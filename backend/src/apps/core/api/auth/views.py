from __future__ import annotations

from django.conf import settings
from django.db.utils import InterfaceError, OperationalError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.selectors import get_user_by_email, get_user_by_username
from apps.core.serializers import SetPasswordSerializer
from apps.core.services import auth_me_payload, issue_tokens, logout_with_refresh_token, normalize_email, set_user_password


class LoginView(APIView):
    permission_classes = []
    authentication_classes = []

    def post(self, request):
        email = normalize_email(request.data.get("email", ""))
        password = request.data.get("password", "")
        domain = email.split("@")[-1] if "@" in email else ""
        try:
            user = get_user_by_email(email)
        except (OperationalError, InterfaceError):
            return Response(
                {
                    "detail": "Service temporarily unavailable (database connection issue). Please retry in a moment.",
                    "code": "db_unavailable",
                },
                status=503,
            )

        if user is None:
            allowed_domains = [d.strip().lower() for d in settings.ALLOWED_EMAIL_DOMAINS]
            if domain not in allowed_domains:
                return Response({"detail": "Email domain not allowed."}, status=400)
            return Response({"detail": "Invalid credentials."}, status=400)

        if not user.check_password(password):
            return Response({"detail": "Invalid credentials."}, status=400)
        if not user.is_active:
            return Response({"detail": "Account is disabled."}, status=403)
        if user.must_set_password:
            return Response({"must_set_password": True}, status=403)

        return Response(issue_tokens(user))


class SetPasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SetPasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Password set.", **issue_tokens(request.user)})


class CheckNewUserView(APIView):
    permission_classes = []
    authentication_classes = []

    def post(self, request):
        username = (request.data.get("username", "") or "").strip()
        if not username:
            return Response({"detail": "Username is required."}, status=400)

        user = get_user_by_username(username)
        if user is None:
            return Response({"valid": False, "detail": "User not found."}, status=404)

        if user.check_password("12345678"):
            return Response({"valid": True, "user_id": user.id})
        return Response({"valid": False, "detail": "User already has a password set."}, status=400)


class SetNewPasswordView(APIView):
    permission_classes = []
    authentication_classes = []

    def post(self, request):
        username = (request.data.get("username", "") or "").strip()
        password = (request.data.get("password", "") or "").strip()
        if not username or not password:
            return Response({"detail": "Username and new password are required."}, status=400)

        user = get_user_by_username(username)
        if user is None:
            return Response({"detail": "User not found."}, status=404)
        if not user.check_password("12345678"):
            return Response({"detail": "User already set a password."}, status=400)

        set_user_password(user, password)
        return Response({"detail": "Password set successfully.", **issue_tokens(user)})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            logout_with_refresh_token(request.data.get("refresh"))
        except Exception:
            pass
        return Response({"detail": "Successfully logged out."}, status=200)


class AuthMeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            return Response(auth_me_payload(request.user, request))
        except Exception:
            return Response({"detail": "An error occurred while retrieving user data."}, status=500)
