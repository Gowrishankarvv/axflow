from django.urls import path

from .views import DashboardAggregatedMaterializedView, DashboardInitView, DashboardSummaryAggregatedView

urlpatterns = [
    path('dashboard/summary/', DashboardSummaryAggregatedView.as_view(), name='dashboard-summary-aggregated'),
    path('dashboard/init/', DashboardInitView.as_view(), name='dashboard-init'),
    path('dashboard/summary/aggregated/', DashboardAggregatedMaterializedView.as_view(), name='dashboard-summary-materialized'),
]
