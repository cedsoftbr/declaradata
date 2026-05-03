import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.factories import (
    RolePermissionFactory,
    ShipmentFactory,
    UserFactory,
)
from apps.shipments.audit import ShipmentExportLog
from apps.users.models import Role, User


@pytest.fixture
def setup_export(db):
    user = UserFactory(profile=User.Profile.ADMIN)
    RolePermissionFactory(
        role=user.role,
        module=Role.Module.DCE,
        can_view=True,
        can_create=True,
        can_edit=True,
        can_delete=True,
    )
    ShipmentFactory(company=user.company)
    return user


@pytest.mark.django_db
def test_export_xlsx_creates_log(setup_export):
    user = setup_export
    client = APIClient()
    client.force_authenticate(user=user)

    url = reverse('shipment-export-xlsx-start')
    response = client.post(url)
    assert response.status_code == status.HTTP_200_OK

    log = ShipmentExportLog.objects.filter(
        company=user.company, export_type='xlsx'
    ).last()
    assert log is not None
    assert log.actor_email == user.email
    assert log.shipment_count >= 0


@pytest.mark.django_db
def test_export_log_list_requires_admin(setup_export):
    user = setup_export
    viewer = User.objects.create_user(
        username='viewer@exp.com',
        email='viewer@exp.com',
        password='pass',
        company=user.company,
        profile=User.Profile.VIEWER,
    )
    client = APIClient()
    client.force_authenticate(user=viewer)

    url = reverse('shipment-export-log-list')
    response = client.get(url)
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_export_log_list_admin_sees_own_company(setup_export):
    user = setup_export
    ShipmentExportLog.objects.create(
        company=user.company,
        actor=user,
        actor_email=user.email,
        export_type='xlsx',
        shipment_count=5,
        filters_applied={},
    )
    client = APIClient()
    client.force_authenticate(user=user)

    url = reverse('shipment-export-log-list')
    response = client.get(url)
    assert response.status_code == status.HTTP_200_OK
    assert response.data['count'] >= 1
