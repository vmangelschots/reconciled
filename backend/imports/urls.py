from rest_framework.routers import DefaultRouter

from .views import ImportSessionViewSet

router = DefaultRouter()
router.register("import-sessions", ImportSessionViewSet, basename="importsession")

urlpatterns = router.urls
