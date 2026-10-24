from rest_framework.routers import DefaultRouter

from .views import TabViewSet, TransactionViewSet

router = DefaultRouter()
router.register("transactions", TransactionViewSet, basename="transaction")
router.register("tabs", TabViewSet, basename="tab")

urlpatterns = router.urls
