from typing import ClassVar

from django_filters import rest_framework as filters

from .models import Shipment


class ShipmentFilter(filters.FilterSet):
    created_at_after = filters.DateTimeFilter(
        field_name='created_at', lookup_expr='gte'
    )
    created_at_before = filters.DateTimeFilter(
        field_name='created_at', lookup_expr='lte'
    )
    user = filters.UUIDFilter(field_name='created_by_id')
    emitter = filters.UUIDFilter(field_name='emitter_id')

    class Meta:
        model = Shipment
        fields: ClassVar[list] = ['status', 'created_by', 'emitter']
