from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    FinanceSummaryView,
    MiscExpenseViewSet,
    ProjectBudgetViewSet,
    SalaryPaymentViewSet,
    TransactionViewSet,
)

router = DefaultRouter()
router.register(r"finance/transactions", TransactionViewSet, basename="finance-transaction")
router.register(r"finance/misc-expenses", MiscExpenseViewSet, basename="finance-misc-expense")
router.register(r"finance/salaries", SalaryPaymentViewSet, basename="finance-salary")
router.register(r"finance/project-budgets", ProjectBudgetViewSet, basename="finance-project-budget")

urlpatterns = [
    path("finance/summary/", FinanceSummaryView.as_view(), name="finance-summary"),
    path("", include(router.urls)),
]
