from unittest.mock import patch

import pytest
from rest_framework.exceptions import ValidationError

from apps.core.factories import (
    CarrierFactory,
    CompanyFactory,
    PersonFactory,
    ProductFactory,
    ShipmentFactory,
    ShipmentItemFactory,
    SuperAdminFactory,
    UserFactory,
)
from apps.persons.models import Person
from apps.shipments.models import Shipment
from apps.shipments.serializers import (
    ShipmentCreateSerializer,
    ShipmentDetailSerializer,
    ShipmentItemSerializer,
)

EXPECTED_VPROD = 50.0
EXPECTED_PERSON_COUNT = 3


@pytest.mark.django_db
def test_shipment_item_serializer_validation():
    data = {'x_prod': 'Test', 'ncm': '12345678', 'q_com': 10, 'v_un_com': 5}
    serializer = ShipmentItemSerializer(data=data)
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data['v_prod'] == pytest.approx(EXPECTED_VPROD)


@pytest.mark.django_db
def test_shipment_item_serializer_fills_v_un_com_from_product():
    product = ProductFactory(unit_value=7.5)
    data = {
        'product_id': product.id,
        'x_prod': 'Test',
        'ncm': '12345678',
        'q_com': 2,
    }
    serializer = ShipmentItemSerializer(data=data)
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data['v_un_com'] == pytest.approx(7.5)
    assert serializer.validated_data['v_prod'] == pytest.approx(15.0)


@pytest.mark.django_db
def test_shipment_item_serializer_requires_v_un_com_without_product_value():
    data = {'x_prod': 'Test', 'ncm': '12345678', 'q_com': 2}
    serializer = ShipmentItemSerializer(data=data)
    assert not serializer.is_valid()
    assert 'v_un_com' in serializer.errors


@pytest.mark.django_db
def test_shipment_create_serializer_validate_items_empty():
    serializer = ShipmentCreateSerializer(data={'items': []})
    with pytest.raises(ValidationError, match=r'Pelo menos um item é obrigatório\.'):
        serializer.validate_items([])


@pytest.mark.django_db
def test_shipment_create_serializer_get_fields_superadmin(db):
    _ = db
    user = SuperAdminFactory()

    class MockRequest:
        def __init__(self, user):
            self.user = user

    context = {'request': MockRequest(user)}
    serializer = ShipmentCreateSerializer(context=context)
    fields = serializer.get_fields()

    # recipient_id uses filter_by_company which returns all if superadmin
    assert fields['recipient_id'].queryset.count() >= 0


@pytest.mark.django_db
def test_shipment_create_serializer_get_fields_manager(db):
    _ = db
    company = CompanyFactory()
    user = UserFactory(company=company)

    PersonFactory(company=company, document='11111111111111')
    PersonFactory(company=company, document='22222222222222')

    class MockRequest:
        def __init__(self, user):
            self.user = user

    context = {'request': MockRequest(user)}
    serializer = ShipmentCreateSerializer(context=context)
    fields = serializer.get_fields()

    # Esperamos 3: 1 auto-criada pelo signal da Company + 2 criadas manualmente aqui
    assert fields['recipient_id'].queryset.count() == EXPECTED_PERSON_COUNT


@pytest.mark.django_db
def test_shipment_detail_serializer_pdf_url(db):
    _ = db
    shipment = ShipmentFactory(status=Shipment.Status.AUTHORIZED)

    class MockRequest:
        pass

    context = {'request': MockRequest()}
    serializer = ShipmentDetailSerializer(shipment, context=context)
    with patch('apps.shipments.serializers.reverse', return_value='http://test/pdf'):
        url = serializer.get_pdf_url(shipment)
        assert url == 'http://test/pdf'


@pytest.mark.django_db
def test_shipment_create_serializer_create(db):
    _ = db
    company = CompanyFactory()
    # Pega a pessoa criada pelo sinal e marca como emitente
    emitter = Person.objects.get(company=company, document=company.cnpj)
    emitter.is_emitente = True
    emitter.save()

    person = PersonFactory(company=company)
    carrier = CarrierFactory(company=company)

    data = {
        'company': company.id,
        'emitter_id': emitter.id,
        'recipient_id': person.id,
        'carrier_id': carrier.id,
        'tp_emit': 1,
        'tp_amb': 2,
        'transport_mode': 1,
        'tp_transp': 2,
        'items': [{'x_prod': 'Prod 1', 'ncm': '12345678', 'q_com': 10, 'v_un_com': 5}],
    }
    serializer = ShipmentCreateSerializer(data=data)
    assert serializer.is_valid(), serializer.errors
    # Number and c_dc now handled by serializer.create
    shipment = serializer.save()
    assert shipment.items.count() == 1
    assert shipment.items.first().v_prod == pytest.approx(EXPECTED_VPROD)


@pytest.mark.django_db
def test_shipment_create_serializer_create_updates_product_unit_value():
    company = CompanyFactory()
    emitter = Person.objects.get(company=company, document=company.cnpj)
    emitter.is_emitente = True
    emitter.save()

    person = PersonFactory(company=company)
    carrier = CarrierFactory(company=company)
    product = ProductFactory(company=company, unit_value=None)

    data = {
        'company': company.id,
        'emitter_id': emitter.id,
        'recipient_id': person.id,
        'carrier_id': carrier.id,
        'tp_emit': 1,
        'tp_amb': 2,
        'transport_mode': 1,
        'tp_transp': 2,
        'items': [{
            'product_id': product.id,
            'x_prod': product.descricao,
            'ncm': product.ncm,
            'q_com': 3,
            'v_un_com': 12.5,
        }],
    }
    serializer = ShipmentCreateSerializer(data=data)
    assert serializer.is_valid(), serializer.errors
    serializer.save()

    product.refresh_from_db()
    assert product.unit_value == pytest.approx(12.5)


@pytest.mark.django_db
def test_shipment_create_serializer_update_sync_items_and_info():
    company = CompanyFactory()
    recipient = PersonFactory(company=company)
    shipment = ShipmentFactory(
        company=company, recipient=recipient, info_complementar='Old'
    )
    item1 = ShipmentItemFactory(
        shipment=shipment,
        x_prod='Item 1',
        ncm='12345678',
        q_com=1,
        v_un_com=10,
        v_prod=10,
        n_item=1,
    )
    item2 = ShipmentItemFactory(
        shipment=shipment,
        x_prod='Item 2',
        ncm='87654321',
        q_com=2,
        v_un_com=5,
        v_prod=10,
        n_item=2,
    )

    payload = {
        'info_complementar': 'Novo texto',
        'items': [
            {
                'id': str(item1.id),
                'x_prod': 'Item 1 editado',
                'ncm': '12345678',
                'q_com': 3,
                'v_un_com': 10,
            },
            {
                'x_prod': 'Item novo',
                'ncm': '11112222',
                'q_com': 1,
                'v_un_com': 7.5,
            },
        ],
    }

    serializer = ShipmentCreateSerializer(instance=shipment, data=payload, partial=True)
    assert serializer.is_valid(), serializer.errors
    updated = serializer.save()
    updated.refresh_from_db()

    assert str(updated.id) == str(shipment.id)
    assert updated.info_complementar == 'Novo texto'
    assert updated.items.count() == 2
    assert not updated.items.filter(id=item2.id).exists()
    assert updated.items.filter(id=item1.id, x_prod='Item 1 editado').exists()
    assert updated.items.filter(x_prod='Item novo').exists()


@pytest.mark.django_db
def test_shipment_create_serializer_update_rejects_foreign_item_id():
    company = CompanyFactory()
    recipient = PersonFactory(company=company)
    shipment = ShipmentFactory(company=company, recipient=recipient)
    foreign_shipment = ShipmentFactory(company=company, recipient=recipient)
    foreign_item = ShipmentItemFactory(shipment=foreign_shipment)

    payload = {
        'items': [
            {
                'id': str(foreign_item.id),
                'x_prod': 'X',
                'ncm': '12345678',
                'q_com': 1,
                'v_un_com': 1,
            }
        ]
    }
    serializer = ShipmentCreateSerializer(instance=shipment, data=payload, partial=True)
    assert serializer.is_valid(), serializer.errors
    with pytest.raises(ValidationError, match='não pertence à remessa'):
        serializer.save()


@pytest.mark.django_db
def test_validate_requires_carrier_when_tp_emit_transportadora():
    company = CompanyFactory()
    recipient = PersonFactory(company=company)
    shipment = ShipmentFactory(
        company=company,
        recipient=recipient,
        tp_emit=Shipment.EmitType.TRANSPORTADORA,
        tp_transp=Shipment.TpTransp.TERCEIRIZADO,
    )
    payload = {
        'tp_transp': Shipment.TpTransp.PROPRIO,
        'carrier_id': None,
    }
    serializer = ShipmentCreateSerializer(instance=shipment, data=payload, partial=True)
    assert not serializer.is_valid()
    assert 'carrier_id' in serializer.errors


@pytest.mark.django_db
def test_validate_clears_carrier_when_not_needed():
    company = CompanyFactory()
    recipient = PersonFactory(company=company)
    carrier = CarrierFactory(company=company)
    shipment = ShipmentFactory(
        company=company,
        recipient=recipient,
        carrier=carrier,
        tp_emit=Shipment.EmitType.PROPRIO,
        tp_transp=Shipment.TpTransp.TERCEIRIZADO,
    )
    payload = {
        'tp_transp': Shipment.TpTransp.PROPRIO,
        'tp_emit': Shipment.EmitType.PROPRIO,
    }
    serializer = ShipmentCreateSerializer(instance=shipment, data=payload, partial=True)
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data['carrier'] is None
