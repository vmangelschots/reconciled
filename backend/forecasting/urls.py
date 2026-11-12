from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ExpectedItemViewSet, ForecastView

router = DefaultRouter()
router.register("expected-items", ExpectedItemViewSet, basename="expecteditem")

urlpatterns = router.urls + [
    path("forecast/", ForecastView.as_view(), name="forecast"),
]
