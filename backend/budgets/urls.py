from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import BudgetSummaryView, CategoryViewSet

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")

urlpatterns = router.urls + [
    path("budgets/summary/", BudgetSummaryView.as_view(), name="budget-summary"),
]
