from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ForecastView, RecurringTransactionViewSet

router = DefaultRouter()
router.register("recurring-transactions", RecurringTransactionViewSet, basename="recurringtransaction")

urlpatterns = router.urls + [
    path("forecast/", ForecastView.as_view(), name="forecast"),
]
