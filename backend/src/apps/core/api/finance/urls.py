from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ExpenseTypeViewSet,
    FinanceSummaryView,
    MiscExpenseViewSet,
    ProjectBudgetViewSet,
    ProjectExpenseViewSet,
    SalaryPaymentViewSet,
    TransactionViewSet,
)

router = DefaultRouter()
router.register(r"finance/transactions", TransactionViewSet, basename="finance-transaction")
router.register(r"finance/misc-expenses", MiscExpenseViewSet, basename="finance-misc-expense")
router.register(r"finance/salaries", SalaryPaymentViewSet, basename="finance-salary")
router.register(r"finance/project-budgets", ProjectBudgetViewSet, basename="finance-project-budget")
router.register(r"finance/expense-types", ExpenseTypeViewSet, basename="finance-expense-type")
router.register(r"finance/project-expenses", ProjectExpenseViewSet, basename="finance-project-expense")

urlpatterns = [
    path("finance/summary/", FinanceSummaryView.as_view(), name="finance-summary"),
    path("", include(router.urls)),
]
