from __future__ import annotations

from django.db import connections
from django.http import JsonResponse
from django.views.decorators.http import require_GET


@require_GET
def health(request):
    return JsonResponse({"status": "ok"}, status=200)


@require_GET
def readiness(request):
    try:
        with connections["default"].cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception as exc:
        return JsonResponse({"status": "error", "checks": {"database": str(exc)}}, status=503)
    return JsonResponse({"status": "ok", "checks": {"database": "ok"}}, status=200)

