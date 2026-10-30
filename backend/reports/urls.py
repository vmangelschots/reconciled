from django.urls import path

from .views import (
    CategorySpendingView,
    EverydayBalanceView,
    NetWorthView,
    OverviewView,
    SpendingCellView,
    SpendingReportView,
)

urlpatterns = [
    path("reports/category-spending/", CategorySpendingView.as_view(), name="report-category-spending"),
    path("reports/everyday-balance/", EverydayBalanceView.as_view(), name="report-everyday-balance"),
    path("reports/net-worth/", NetWorthView.as_view(), name="report-net-worth"),
    path("reports/spending/", SpendingReportView.as_view(), name="report-spending"),
    path("reports/spending/transactions/", SpendingCellView.as_view(), name="report-spending-cell"),
    path("reports/overview/", OverviewView.as_view(), name="report-overview"),
]
