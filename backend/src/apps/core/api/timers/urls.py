from django.urls import path

from .views import TimeEntryCurrentView, TimeEntryStartView, TimeEntryStopView

urlpatterns = [
    path('time-entry/start/', TimeEntryStartView.as_view(), name='time-entry-start'),
    path('time-entry/stop/', TimeEntryStopView.as_view(), name='time-entry-stop'),
    path('time-entry/current/', TimeEntryCurrentView.as_view(), name='time-entry-current'),
    # Legacy pluralized aliases for backwards compatibility
    path('time-entries/start/', TimeEntryStartView.as_view(), name='time-entries-start'),
    path('time-entries/stop/', TimeEntryStopView.as_view(), name='time-entries-stop'),
    path('time-entries/current/', TimeEntryCurrentView.as_view(), name='time-entries-current'),
]
