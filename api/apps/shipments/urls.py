from rest_framework.routers import DefaultRouter

from .views import SeriesViewSet, ShipmentExportLogViewSet, ShipmentViewSet

router = DefaultRouter()
router.register(r'series', SeriesViewSet, basename='series')
router.register(r'export-log', ShipmentExportLogViewSet, basename='shipment-export-log')
router.register(r'', ShipmentViewSet, basename='shipment')

urlpatterns = router.urls
