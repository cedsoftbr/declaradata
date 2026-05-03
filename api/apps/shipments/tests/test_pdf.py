from unittest.mock import MagicMock, patch

import pytest

from apps.shipments.models import Shipment
from apps.shipments.pdf_generator import generate_dce_pdf


@pytest.fixture
def shipment():
    shipment = MagicMock(spec=Shipment)
    shipment.pk = 3
    shipment.access_key = 'some-key'
    shipment.items.all.return_value = []
    return shipment


@pytest.mark.django_db
def test_generate_dce_pdf_success():
    shipment = MagicMock(spec=Shipment)
    shipment.pk = 1
    shipment.access_key = 'DCe3523101234567890123456789012345678901234567'
    shipment.items.all.return_value = []
    shipment.status = Shipment.Status.AUTHORIZED

    # Mock render_to_string and HTML
    with (
        patch(
            'apps.shipments.pdf_generator.render_to_string',
            return_value='<html></html>',
        ) as mock_render,
        patch('apps.shipments.pdf_generator.HTML') as mock_html,
    ):
        mock_html_instance = mock_html.return_value
        mock_html_instance.write_pdf.return_value = None

        pdf_content = generate_dce_pdf(shipment)

        assert mock_render.called
        assert mock_html.called
        assert isinstance(pdf_content, bytes)


def test_generate_dce_pdf_no_access_key():
    shipment = MagicMock(spec=Shipment)
    shipment.pk = 2
    shipment.access_key = None
    shipment.items.all.return_value = []

    with (
        patch(
            'apps.shipments.pdf_generator.render_to_string',
            return_value='<html></html>',
        ),
        patch('apps.shipments.pdf_generator.HTML') as mock_html,
    ):
        _ = mock_html.return_value
        pdf_content = generate_dce_pdf(shipment)
        assert isinstance(pdf_content, bytes)


def test_generate_dce_pdf_barcode_error(shipment):
    # Mocking barcode generation to fail
    with (
        patch(
            'apps.shipments.pdf_generator.barcode.get_barcode_class',
            side_effect=Exception('Barcode error'),
        ),
        patch(
            'apps.shipments.pdf_generator.render_to_string',
            return_value='<html></html>',
        ),
        patch('apps.shipments.pdf_generator.HTML'),
    ):
        pdf_content = generate_dce_pdf(shipment)
        assert isinstance(pdf_content, bytes)


def test_generate_dce_pdf_qr_error(shipment):
    # QR code is generated inside generate_dce_pdf
    with (
        patch(
            'apps.shipments.pdf_generator.qrcode.QRCode',
            side_effect=Exception('QR error'),
        ),
        patch(
            'apps.shipments.pdf_generator.render_to_string',
            return_value='<html></html>',
        ),
        patch('apps.shipments.pdf_generator.HTML'),
    ):
        pdf_content = generate_dce_pdf(shipment)
        assert isinstance(pdf_content, bytes)
