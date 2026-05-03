from unittest.mock import patch

import pytest
from celery.exceptions import Retry

from apps.core.factories import ShipmentFactory
from apps.shipments.models import Shipment
from apps.shipments.tasks import emit_shipment_task


@pytest.fixture
def shipment(db):
    _ = db
    return ShipmentFactory(status=Shipment.Status.DRAFT)


@pytest.mark.django_db
def test_emit_shipment_task_success(shipment):
    with patch('apps.shipments.tasks.emit_shipment') as mock_emit:
        emit_shipment_task(shipment.id)
        mock_emit.assert_called_once()


@pytest.mark.django_db
def test_emit_shipment_task_failure(shipment):
    with (
        patch(
            'apps.shipments.tasks.emit_shipment', side_effect=Exception('Emit Error')
        ),
        patch(
            'apps.shipments.tasks.emit_shipment_task.retry', side_effect=Retry
        ) as mock_retry,
    ):
        # Mudar para processing para simular o estado inicial da tarefa
        shipment.status = Shipment.Status.PROCESSING
        shipment.save()

        # Catching Retry because that's what Celery eager does when retry is called
        with pytest.raises(Retry):
            emit_shipment_task(shipment.id)

        shipment.refresh_from_db()
        # Per logic in tasks.py: if it's going to retry, status remains PROCESSING
        assert shipment.status == Shipment.Status.PROCESSING
        mock_retry.assert_called_once()
