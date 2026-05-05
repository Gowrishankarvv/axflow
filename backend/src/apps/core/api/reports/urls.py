from django.urls import path

from .views import ReportsSummaryView, TeamSummaryReportView

urlpatterns = [
    path('reports/summary/', ReportsSummaryView.as_view(), name='reports-summary'),
    path('reports/team-summary/', TeamSummaryReportView.as_view(), name='reports-team-summary'),
]
