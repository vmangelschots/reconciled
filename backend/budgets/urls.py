from django.urls import path
from rest_framework.routers import DefaultRouter

from . import plan_views
from .views import BudgetSettingsView, BudgetSummaryView, CategoryViewSet

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")

urlpatterns = router.urls + [
    path("budgets/summary/", BudgetSummaryView.as_view(), name="budget-summary"),
    path("budgets/settings/", BudgetSettingsView.as_view(), name="budget-settings"),
    # Year plans - see openspec/specs/year-plans.
    path("budgets/plans/", plan_views.PlanListView.as_view(), name="plan-list"),
    path("budgets/plans/income-suggestions/", plan_views.IncomeSuggestionsView.as_view(), name="plan-income-suggestions"),
    path("budgets/plans/current/<int:year>/", plan_views.CurrentPlanView.as_view(), name="plan-current"),
    path("budgets/plans/current/<int:year>/income/", plan_views.IncomeListView.as_view(), name="plan-current-income"),
    path(
        "budgets/plans/current/<int:year>/income/<int:line_id>/",
        plan_views.IncomeDetailView.as_view(),
        name="plan-current-income-line",
    ),
    path("budgets/plans/<int:pk>/", plan_views.PlanDetailView.as_view(), name="plan-detail"),
    path("budgets/plans/<int:pk>/duplicate/", plan_views.PlanDuplicateView.as_view(), name="plan-duplicate"),
    path("budgets/plans/<int:pk>/categories/", plan_views.PlanAddCategoryView.as_view(), name="plan-add-category"),
    path(
        "budgets/plans/<int:pk>/categories/<int:category_id>/budget/",
        plan_views.PlanCategoryView.as_view(),
        name="plan-category-budget",
    ),
    path(
        "budgets/plans/<int:pk>/categories/<int:category_id>/bills/",
        plan_views.PlanBillsView.as_view(),
        name="plan-category-bills",
    ),
    path(
        "budgets/plans/<int:pk>/categories/<int:category_id>/use-current/",
        plan_views.PlanUseCurrentView.as_view(),
        name="plan-category-use-current",
    ),
    path("budgets/plans/<int:pk>/income/", plan_views.IncomeListView.as_view(), name="plan-income"),
    path("budgets/plans/<int:pk>/income/<int:line_id>/", plan_views.IncomeDetailView.as_view(), name="plan-income-line"),
    path("budgets/plans/<int:pk>/apply/", plan_views.PlanApplyView.as_view(), name="plan-apply"),
]
