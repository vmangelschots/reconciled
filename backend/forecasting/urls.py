from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ExpectedItemViewSet, ForecastView, NetWorthForecastView

router = DefaultRouter()
router.register("expected-items", ExpectedItemViewSet, basename="expecteditem")

urlpatterns = router.urls + [
    path("forecast/", ForecastView.as_view(), name="forecast"),
    path("forecast/net-worth/", NetWorthForecastView.as_view(), name="forecast-net-worth"),
]
