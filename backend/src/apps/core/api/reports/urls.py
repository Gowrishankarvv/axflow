from django.urls import path

from .views import (
    ClockTimeReportView,
    FinanceReportView,
    ProjectReportView,
    ReportsSummaryView,
    TeamSummaryReportView,
)

urlpatterns = [
    path('reports/summary/', ReportsSummaryView.as_view(), name='reports-summary'),
    path('reports/team-summary/', TeamSummaryReportView.as_view(), name='reports-team-summary'),
    path('reports/project-summary/', ProjectReportView.as_view(), name='reports-project-summary'),
    path('reports/finance-summary/', FinanceReportView.as_view(), name='reports-finance-summary'),
    path('reports/clock-summary/', ClockTimeReportView.as_view(), name='reports-clock-summary'),
]
