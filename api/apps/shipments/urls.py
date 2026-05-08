from rest_framework.routers import DefaultRouter

from .views import (
    DashboardViewSet,
    SeriesViewSet,
    ShipmentExportLogViewSet,
    ShipmentViewSet,
)

router = DefaultRouter()
router.register(r'series', SeriesViewSet, basename='series')
router.register(r'export-log', ShipmentExportLogViewSet, basename='shipment-export-log')
router.register(r'dashboard', DashboardViewSet, basename='dashboard')
router.register(r'', ShipmentViewSet, basename='shipment')

urlpatterns = router.urls
