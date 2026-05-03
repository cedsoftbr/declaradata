import datetime
from unittest.mock import MagicMock

import pytest

from apps.shipments.models import Shipment
from apps.shipments.xml_builder import build_access_key, build_dce_xml
from apps.shipments.xml_validator import validate_inf_dce_access_key


class FakeItem:
    def __init__(self, n_item, x_prod, ncm, q_com, v_un_com, v_prod):  # noqa: PLR0913, PLR0917
        self.n_item = n_item
        self.x_prod = x_prod
        self.ncm = ncm
        self.q_com = q_com
        self.v_un_com = v_un_com
        self.v_prod = v_prod


def _shipment_mock():
    shipment = MagicMock(spec=Shipment)
    shipment.tp_amb = 2
    shipment.tp_emis = 1
    shipment.tp_emit = 2
    shipment.tp_transp = 2
    shipment.transport_mode = 1
    shipment.serie = 1
    shipment.number = 123
    shipment.c_dc = '123456'
    shipment.c_dv = '9'
    shipment.dh_emi = datetime.datetime(2023, 10, 1, tzinfo=datetime.UTC)
    shipment.info_complementar = None
    shipment.info_fisco = None
    shipment.emit_snapshot = {
        'city_ibge_code': '4106902',
        'city_uf': 'PR',
        'cnpj': '12345678000190',
        'name': 'Emitente',
        'address': 'Rua',
        'number': '1',
        'complement': '',
        'neighborhood': 'Centro',
        'city_name': 'Curitiba',
        'uf': 'PR',
        'zip_code': '80000000',
    }
    shipment.recipient_snapshot = {
        'document': '98765432000100',
        'document_type': 'cnpj',
        'name': 'Destinatario',
        'address': 'Rua',
        'number': '1',
        'complement': '',
        'neighborhood': 'Centro',
        'city_ibge_code': '4106902',
        'city_name': 'Curitiba',
        'city_uf': 'PR',
        'uf': 'PR',
        'zip_code': '80000000',
    }
    shipment.sender_snapshot = None
    shipment.carrier_snapshot = {
        'cnpj': '11111111000191',
        'document': '11111111000191',
        'name': 'Transportadora XYZ',
    }
    shipment.participants_snapshot = {
        'emitter': {
            'cnpj': '12345678000190',
            'name': 'Emitente',
        }
    }
    item = FakeItem(1, 'Produto', '12345678', 1.0, 100.0, 100.0)
    shipment.items.all.return_value = [item]
    return shipment


@pytest.mark.django_db
def test_validate_inf_dce_access_key_ok(db):
    _ = db
    shipment = _shipment_mock()
    build_access_key(shipment)
    xml_bytes = build_dce_xml(shipment)
    validate_inf_dce_access_key(xml_bytes, shipment.access_key)


@pytest.mark.django_db
def test_validate_inf_dce_access_key_detects_mismatch(db):
    _ = db
    shipment = _shipment_mock()
    build_access_key(shipment)
    xml_bytes = build_dce_xml(shipment)
    tampered = xml_bytes.replace(b'<cDV>', b'<cDV>9', 1)
    with pytest.raises(ValueError, match=r'cDV inválido|Campo Id não corresponde'):
        validate_inf_dce_access_key(tampered, shipment.access_key)
