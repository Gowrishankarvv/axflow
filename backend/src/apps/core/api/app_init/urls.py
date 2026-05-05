from django.urls import path

from .views import AppInitialDataView

urlpatterns = [
    path('app-initial-data/', AppInitialDataView.as_view(), name='app-initial-data'),
]
