from rest_framework.routers import DefaultRouter

from .views import NcmCatalogViewSet, ProductViewSet

router = DefaultRouter()
router.register('ncm-catalog', NcmCatalogViewSet, basename='ncm-catalog')
router.register('', ProductViewSet, basename='product')

urlpatterns = router.urls
