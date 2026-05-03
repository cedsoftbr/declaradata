from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    PersonAddressByPersonViewSet,
    PersonAddressViewSet,
    PersonAuditLogViewSet,
    PersonViewSet,
)

router = DefaultRouter()
router.register('audit-log', PersonAuditLogViewSet, basename='person-audit-log')
router.register('', PersonViewSet, basename='person')

person_address_by_person_list = PersonAddressByPersonViewSet.as_view({
    'get': 'list',
    'post': 'create',
})
person_address_actions = PersonAddressViewSet.as_view({
    'delete': 'destroy',
})
person_address_set_default = PersonAddressViewSet.as_view({'post': 'set_default'})

urlpatterns = [
    path(
        '<uuid:pk>/addresses/', person_address_by_person_list, name='person-addresses'
    ),
    path(
        'addresses/<uuid:pk>/',
        person_address_actions,
        name='person-address-detail',
    ),
    path(
        'addresses/<uuid:pk>/set_default/',
        person_address_set_default,
        name='person-address-set-default',
    ),
    *router.urls,
]
