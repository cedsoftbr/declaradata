from rest_framework.routers import DefaultRouter

from .views import RoleViewSet, UserViewSet

users_router = DefaultRouter()
users_router.register('roles', RoleViewSet, basename='role')
users_router.register('', UserViewSet, basename='user')
