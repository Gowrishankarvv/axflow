from __future__ import annotations
from django.utils.deprecation import MiddlewareMixin
from django.conf import settings
from typing import Any
from django.http import JsonResponse
from django.db.utils import OperationalError, InterfaceError


class DevRequestResponseLogger(MiddlewareMixin):
    """
    Development-only middleware that logs request payloads (request.data),
    query params (request.GET), and response payloads (when JSON-like).

    This makes payload flow visible during development as requested.
    Logs only when settings.DEBUG is True to avoid noisy production logs.
    """

    def process_request(self, request):
        if not getattr(settings, 'DEBUG', False):
            return None
        try:
            # Note: request.body may be large; print concise info
            print(f"[DEV] -> {request.method} {request.path} QS={dict(request.GET)}")
        except Exception:
            pass
        return None

    def process_response(self, request, response):
        if not getattr(settings, 'DEBUG', False):
            return response
        try:
            # Avoid dumping binary; show status and basic JSON if present
            payload: Any = getattr(response, 'data', None)
            if payload is None:
                print(f"[DEV] <- {request.method} {request.path} status={response.status_code}")
            else:
                # Trim long payloads
                preview = str(payload)
                if len(preview) > 1000:
                    preview = preview[:1000] + '...'
                print(f"[DEV] <- {request.method} {request.path} status={response.status_code} payload={preview}")
        except Exception:
            pass
        return response


class DatabaseUnavailableMiddleware(MiddlewareMixin):
    """
    If the database is temporarily unreachable (e.g. Supabase pooler timeout),
    return a fast 503 JSON response for API requests instead of a 500/blank hang.
    """

    def process_exception(self, request, exception):
        if not isinstance(exception, (OperationalError, InterfaceError)):
            return None

        # Log the actual error to stderr so it appears in Render logs
        import sys
        print(f"DATABASE CONNECTION ERROR: {exception}", file=sys.stderr)

        # Only intercept API routes; let non-API paths behave normally
        path = getattr(request, "path", "") or ""
        if not (path.startswith("/api/") or path.startswith("/api")):
            return None

        return JsonResponse(
            {
                "detail": "Service temporarily unavailable (database connection issue). Please retry in a moment.",
                "code": "db_unavailable",
            },
            status=503,
        )

