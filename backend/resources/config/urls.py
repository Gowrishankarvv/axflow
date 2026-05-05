from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from .health import health, readiness

urlpatterns = [
    # Production-style health endpoint (readiness with DB check)
    path("health/", readiness),
    # Legacy aliases
    path("healthz/", health),
    path("readyz/", readiness),
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema")),
    path("api/", include("apps.core.api.urls")),
    path("api/slack/", include("apps.slack.api.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
