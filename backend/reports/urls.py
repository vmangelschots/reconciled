from django.urls import path

from .views import CashFlowView, CategorySpendingView, EverydayBalanceView, NetWorthView, OverviewView

urlpatterns = [
    path("reports/cash-flow/", CashFlowView.as_view(), name="report-cash-flow"),
    path("reports/category-spending/", CategorySpendingView.as_view(), name="report-category-spending"),
    path("reports/everyday-balance/", EverydayBalanceView.as_view(), name="report-everyday-balance"),
    path("reports/net-worth/", NetWorthView.as_view(), name="report-net-worth"),
    path("reports/overview/", OverviewView.as_view(), name="report-overview"),
]
