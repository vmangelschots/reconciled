from django.urls import path

from .views import CashFlowView, CategorySpendingView

urlpatterns = [
    path("reports/cash-flow/", CashFlowView.as_view(), name="report-cash-flow"),
    path("reports/category-spending/", CategorySpendingView.as_view(), name="report-category-spending"),
]
