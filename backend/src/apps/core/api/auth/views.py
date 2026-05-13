from __future__ import annotations

from django.conf import settings
from django.db.utils import InterfaceError, OperationalError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.selectors import get_user_by_email
from apps.core.serializers import SetPasswordSerializer
from apps.core.services import auth_me_payload, issue_tokens, logout_with_refresh_token, normalize_email


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
            # Clients are external — they intentionally bypass the domain check.
            # Without a user row we still want a generic error rather than
            # confirming the email exists.
            if domain not in allowed_domains:
                return Response({"detail": "Invalid credentials."}, status=400)
            return Response({"detail": "Invalid credentials."}, status=400)

        if not user.check_password(password):
            return Response({"detail": "Invalid credentials."}, status=400)
        if not user.is_active:
            return Response({"detail": "Account is disabled."}, status=403)

        # Always issue tokens — even when must_set_password is True. The
        # frontend reads the must_set_password flag and routes the user to
        # /set-password/ before letting them use the rest of the app. This is
        # what replaces the old `12345678`-seed backdoor.
        payload = issue_tokens(user)
        if user.must_set_password:
            payload["must_set_password"] = True
        return Response(payload)


class SetPasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SetPasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Password set.", **issue_tokens(request.user)})


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
