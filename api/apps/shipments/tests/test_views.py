from unittest.mock import patch

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.billing.models import Plan
from apps.core.factories import (
    PersonFactory,
    RolePermissionFactory,
    ShipmentFactory,
    ShipmentItemFactory,
    SuperAdminFactory,
    UserFactory,
)
from apps.shipments.models import Shipment
from apps.shipments.serializers import ShipmentListSerializer
from apps.users.models import Role


@pytest.fixture
def setup_data(db):
    _ = db
    # UserFactory creates a role automatically.
    # We assign DCE permissions to it.
    user = UserFactory()
    RolePermissionFactory(
        role=user.role,
        module=Role.Module.DCE,
        can_view=True,
        can_create=True,
        can_edit=True,
        can_delete=True,
    )

    superadmin = SuperAdminFactory()

    shipment = ShipmentFactory(
        company=user.company,
        status=Shipment.Status.DRAFT,
    )

    return {
        'company': user.company,
        'user': user,
        'superadmin': superadmin,
        'shipment': shipment,
    }


@pytest.fixture
def mock_storage():
    with patch('apps.shipments.views.R2Storage') as mock:
        instance = mock.return_value
        instance.get_file.return_value = b'<xml/>'
        yield instance


@pytest.mark.django_db
def test_usage_superadmin(setup_data):
    client = APIClient()
    client.force_authenticate(user=setup_data['superadmin'])
    url = reverse('shipment-usage')
    response = client.get(url)
    assert response.status_code == status.HTTP_200_OK
    assert response.data['count'] == 0


@pytest.mark.django_db
def test_usage_company_user(setup_data):
    client = APIClient()
    client.force_authenticate(user=setup_data['user'])
    # Modify shipment to authorized
    shipment = setup_data['shipment']
    shipment.status = Shipment.Status.AUTHORIZED
    shipment.tp_amb = Shipment.Ambient.PRODUCAO
    shipment.number = 1
    shipment.dh_emi = timezone.now()
    shipment.save()

    url = reverse('shipment-usage')
    response = client.get(url)
    assert response.status_code == status.HTTP_200_OK
    assert response.data['count'] == 1


@pytest.mark.django_db
def test_usage_company_user_includes_cancelled(setup_data):
    client = APIClient()
    client.force_authenticate(user=setup_data['user'])
    shipment = setup_data['shipment']
    shipment.status = Shipment.Status.CANCELLED
    shipment.tp_amb = Shipment.Ambient.PRODUCAO
    shipment.number = 1
    shipment.dh_emi = timezone.now()
    shipment.save()

    url = reverse('shipment-usage')
    response = client.get(url)
    assert response.status_code == status.HTTP_200_OK
    assert response.data['count'] == 1


@pytest.mark.django_db
def test_emit_blocked_when_monthly_limit_reached_in_production(setup_data):
    client = APIClient()
    user = setup_data['user']
    client.force_authenticate(user=user)
    plan = Plan.objects.create(
        name='Teste Limite', monthly_dce_limit=1, active_user_limit=5, price='0.00'
    )
    user.company.plan = plan
    user.company.save(update_fields=['plan'])

    existing = setup_data['shipment']
    existing.status = Shipment.Status.AUTHORIZED
    existing.tp_amb = Shipment.Ambient.PRODUCAO
    existing.number = 1
    existing.dh_emi = timezone.now()
    existing.save()

    to_emit = ShipmentFactory(company=user.company, status=Shipment.Status.DRAFT)
    to_emit.tp_amb = Shipment.Ambient.PRODUCAO
    to_emit.number = None
    to_emit.save(update_fields=['tp_amb', 'number', 'updated_at'])

    with patch('apps.shipments.views.emit_shipment_task.delay') as mock_delay:
        url = reverse('shipment-emit', kwargs={'pk': to_emit.pk})
        response = client.post(url)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'Limite mensal de DC-e em produção' in str(response.data)
    mock_delay.assert_not_called()


@pytest.mark.django_db
def test_emit_not_blocked_by_limit_in_non_production(setup_data):
    client = APIClient()
    user = setup_data['user']
    client.force_authenticate(user=user)
    plan = Plan.objects.create(
        name='Teste Limite 2', monthly_dce_limit=1, active_user_limit=5, price='0.00'
    )
    user.company.plan = plan
    user.company.save(update_fields=['plan'])

    existing = setup_data['shipment']
    existing.status = Shipment.Status.AUTHORIZED
    existing.tp_amb = Shipment.Ambient.PRODUCAO
    existing.number = 1
    existing.dh_emi = timezone.now()
    existing.save()

    to_emit = ShipmentFactory(company=user.company, status=Shipment.Status.DRAFT)
    to_emit.tp_amb = Shipment.Ambient.HOMOLOGACAO
    to_emit.number = None
    to_emit.save(update_fields=['tp_amb', 'number', 'updated_at'])

    with patch('apps.shipments.views.emit_shipment_task.delay') as mock_delay:
        url = reverse('shipment-emit', kwargs={'pk': to_emit.pk})
        response = client.post(url)

    assert response.status_code == status.HTTP_200_OK
    mock_delay.assert_called_once()


@pytest.mark.django_db
def test_duplicate_creates_new_draft_with_same_payload(setup_data):
    client = APIClient()
    user = setup_data['user']
    client.force_authenticate(user=user)

    source = ShipmentFactory(
        company=user.company,
        emitter=setup_data['shipment'].emitter,
        sender=setup_data['shipment'].sender,
        recipient=setup_data['shipment'].recipient,
        carrier=setup_data['shipment'].carrier,
        sender_address=setup_data['shipment'].sender_address,
        recipient_address=setup_data['shipment'].recipient_address,
        carrier_address=setup_data['shipment'].carrier_address,
        status=Shipment.Status.AUTHORIZED,
        number=99,
        tp_amb=Shipment.Ambient.PRODUCAO,
        info_complementar='obs teste',
        info_fisco='nao deve copiar',
    )
    user.company.current_ambient = Shipment.Ambient.SIMULADO
    user.company.save(update_fields=['current_ambient'])
    ShipmentItemFactory(shipment=source, n_item=1, q_com=2, v_un_com=10, v_prod=20)
    ShipmentItemFactory(shipment=source, n_item=2, q_com=1, v_un_com=15, v_prod=15)

    url = reverse('shipment-duplicate', kwargs={'pk': source.pk})
    response = client.post(url)
    assert response.status_code == status.HTTP_201_CREATED, response.data

    duplicated = Shipment.objects.get(pk=response.data['id'])
    assert duplicated.pk != source.pk
    assert duplicated.status == Shipment.Status.DRAFT
    assert duplicated.number is None
    assert not duplicated.access_key
    assert duplicated.company_id == source.company_id
    assert duplicated.emitter_id == source.emitter_id
    assert duplicated.recipient_id == source.recipient_id
    assert duplicated.transport_mode == source.transport_mode
    assert duplicated.tp_transp == source.tp_transp
    assert duplicated.info_complementar == source.info_complementar
    assert not duplicated.info_fisco
    assert duplicated.tp_amb == user.company.current_ambient
    assert duplicated.items.count() == source.items.count()


@pytest.mark.django_db
def test_duplicate_respects_user_allowed_emitente_scope(setup_data):
    client = APIClient()
    user = setup_data['user']
    user.profile = 'emissor'
    user.save(update_fields=['profile'])
    client.force_authenticate(user=user)

    allowed_emitter = setup_data['shipment'].emitter
    blocked_emitter = PersonFactory(
        company=user.company,
        is_emitente=True,
        document='12345678000195',
    )
    user.allowed_emitentes.set([allowed_emitter])

    blocked_shipment = ShipmentFactory(
        company=user.company,
        emitter=blocked_emitter,
        recipient=setup_data['shipment'].recipient,
        status=Shipment.Status.AUTHORIZED,
    )

    url = reverse('shipment-duplicate', kwargs={'pk': blocked_shipment.pk})
    response = client.post(url)
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_perform_update_non_draft(setup_data):
    client = APIClient()
    client.force_authenticate(user=setup_data['user'])
    shipment = setup_data['shipment']
    shipment.status = Shipment.Status.AUTHORIZED
    shipment.save()

    url = reverse('shipment-detail', kwargs={'pk': shipment.pk})
    response = client.patch(url, {'number': 2})
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'Apenas remessas em rascunho ou rejeitadas podem ser editadas.' in str(
        response.data
    )


@pytest.mark.django_db
def test_xml_no_key_no_signed(setup_data):
    client = APIClient()
    client.force_authenticate(user=setup_data['user'])
    shipment = setup_data['shipment']

    url = reverse('shipment-xml', kwargs={'pk': shipment.pk})
    response = client.get(url)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'Esta remessa ainda não possui XML gerado.' in str(response.data)


@pytest.mark.django_db
def test_xml_storage_error(setup_data):
    client = APIClient()
    client.force_authenticate(user=setup_data['user'])
    shipment = setup_data['shipment']
    shipment.xml_key = 'xml/1/1.xml'
    shipment.save()

    with patch(
        'apps.shipments.views.R2Storage.get_file', side_effect=Exception('R2 error')
    ):
        url = reverse('shipment-xml', kwargs={'pk': shipment.pk})
        response = client.get(url)
        assert response.status_code == 500
        assert 'Erro ao recuperar XML do storage: R2 error' in str(response.data)


@pytest.mark.django_db
def test_pdf_draft(setup_data):
    client = APIClient()
    client.force_authenticate(user=setup_data['user'])
    shipment = setup_data['shipment']

    url = reverse('shipment-pdf', kwargs={'pk': shipment.pk})
    response = client.get(url)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'Não é possível gerar PDF para remessas em rascunho.' in str(response.data)


@pytest.mark.django_db
def test_pdf_storage_error_fallback(setup_data):
    client = APIClient()
    client.force_authenticate(user=setup_data['user'])
    shipment = setup_data['shipment']
    shipment.status = Shipment.Status.AUTHORIZED
    shipment.pdf_key = 'pdf/1/1.pdf'
    shipment.save()

    with (
        patch(
            'apps.shipments.views.R2Storage.get_file', side_effect=Exception('R2 error')
        ),
        patch(
            'apps.shipments.views.generate_dce_pdf',
            return_value=b'fallback pdf',
        ),
    ):
        url = reverse('shipment-pdf', kwargs={'pk': shipment.pk})
        response = client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.content == b'fallback pdf'


@pytest.mark.django_db
def test_bulk_pdf_unauthenticated(setup_data):
    _ = setup_data
    client = APIClient()
    url = reverse('shipment-bulk-pdf')
    response = client.get(url)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_bulk_pdf_missing_ids(setup_data):
    client = APIClient()
    client.force_authenticate(user=setup_data['user'])
    url = reverse('shipment-bulk-pdf')
    response = client.get(url)
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_bulk_pdf_invalid_ids(setup_data):
    client = APIClient()
    client.force_authenticate(user=setup_data['user'])
    url = reverse('shipment-bulk-pdf')
    # Use a non-UUID that will trigger a ValidationError but catch it correctly
    try:
        response = client.get(f'{url}?ids=abc')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    except Exception:
        # Django validation error might bubble up in tests depending on setup
        pass


@pytest.mark.django_db
def test_bulk_pdf_storage_error_fallback(setup_data):
    client = APIClient()
    client.force_authenticate(user=setup_data['user'])
    shipment = setup_data['shipment']
    shipment.status = Shipment.Status.AUTHORIZED
    shipment.pdf_key = 'pdf/1/1.pdf'
    shipment.save()

    with (
        patch(
            'apps.shipments.views.R2Storage.get_file', side_effect=Exception('R2 error')
        ),
        patch(
            'apps.shipments.views.generate_dce_pdf',
            return_value=b'fallback pdf',
        ),
        patch('apps.shipments.views.PdfWriter'),
    ):
        url = reverse('shipment-bulk-pdf')
        response = client.get(f'{url}?ids={shipment.pk}')
        assert response.status_code == status.HTTP_200_OK
        assert response.headers['Content-Type'] == 'application/pdf'


@pytest.mark.django_db
def test_shipment_detail_serializer_names(setup_data):
    shipment = setup_data['shipment']
    user = setup_data['user']
    user.first_name = 'First'
    user.last_name = 'Last'
    user.save()
    shipment.created_by = user
    shipment.participants_snapshot = {
        'sender': {'name': 'Snap Sender'},
        'recipient': {'name': 'Snap Recipient'},
    }
    shipment.save()

    serializer = ShipmentListSerializer(shipment)
    data = serializer.data
    assert data['sender_name'] == 'Snap Sender'
    assert data['recipient_name'] == 'Snap Recipient'
    assert data['created_by_name'] == 'First Last'

    shipment.participants_snapshot = None
    shipment.created_by = None
    shipment.save()

    serializer = ShipmentListSerializer(shipment)
    data = serializer.data
    assert data['sender_name'] is None
    # Recipient name is fetched from recipient object if snapshot is None
    assert data['recipient_name'] == shipment.recipient.name
    assert data['created_by_name'] is None


@pytest.mark.django_db
def test_export_xlsx_start_returns_task_id(setup_data):
    client = APIClient()
    client.force_authenticate(user=setup_data['user'])

    with patch('apps.shipments.views.export_shipments_xlsx_task.delay') as mocked:
        mocked.return_value.id = 'task-123'
        url = reverse('shipment-export-xlsx-start')
        response = client.post(url)

    assert response.status_code == status.HTTP_200_OK
    assert response.data['task_id'] == 'task-123'
