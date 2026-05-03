import datetime
from unittest.mock import MagicMock

import pytest

from apps.shipments.models import Shipment
from apps.shipments.xml_builder import build_access_key, build_dce_xml

EXPECTED_KEY_LEN = 44


@pytest.mark.django_db
def test_build_access_key_full(db):
    _ = db
    shipment = MagicMock(spec=Shipment)
    shipment.participants_snapshot = {
        'emitter': {'city_ibge_code': '4106902', 'cnpj': '12345678000190'},
    }
    shipment.emit_snapshot = {'city_ibge_code': '4106902', 'cnpj': '12345678000190'}
    shipment.dh_emi = datetime.datetime(2023, 10, 1, tzinfo=datetime.UTC)
    shipment.serie = 1
    shipment.number = 123
    shipment.tp_emis = 1
    shipment.tp_emit = 2
    shipment.c_dc = '12345678'

    build_access_key(shipment)
    assert len(shipment.access_key) == EXPECTED_KEY_LEN
    assert shipment.access_key.startswith('41230912345678000190')


@pytest.mark.django_db
def test_build_access_key_cuf_comes_from_emitter_not_sender(db):
    _ = db
    shipment = MagicMock(spec=Shipment)
    # emitente em PR (41), remetente em GO (52)
    shipment.participants_snapshot = {
        'emitter': {'city_ibge_code': '4106902', 'cnpj': '12345678000190'},
        'emit': {'city_ibge_code': '5208707', 'cnpj': '12345678000190'},
    }
    shipment.emit_snapshot = {'city_ibge_code': '5208707', 'cnpj': '12345678000190'}
    shipment.dh_emi = datetime.datetime(2023, 10, 1, tzinfo=datetime.UTC)
    shipment.serie = 1
    shipment.number = 1
    shipment.tp_emis = 1
    shipment.tp_emit = 2
    shipment.c_dc = '123456'

    build_access_key(shipment)
    assert shipment.access_key.startswith('41')


class FakeItem:
    def __init__(self, n_item, x_prod, ncm, q_com, v_un_com, v_prod):  # noqa: PLR0913, PLR0917
        self.n_item = n_item
        self.x_prod = x_prod
        self.ncm = ncm
        self.q_com = q_com
        self.v_un_com = v_un_com
        self.v_prod = v_prod
        self.product_id = 1


@pytest.mark.django_db
def test_build_dce_xml_basic(db):
    _ = db
    shipment = MagicMock(spec=Shipment)
    shipment.access_key = '41231012345678000190550010000001231123456789'
    shipment.tp_amb = 2
    shipment.tp_emis = 1
    shipment.tp_emit = 2
    shipment.transport_mode = 1
    shipment.serie = 1
    shipment.number = 123
    shipment.c_dc = '12345678'
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
    # Explicitly set to None or a real dict to avoid MagicMock triggering code
    shipment.sender_snapshot = None
    shipment.carrier_snapshot = None
    shipment.participants_snapshot = {
        'emitter': {
            'cnpj': '12345678000190',
            'name': 'Emitente',
        }
    }

    item = FakeItem(1, 'Produto', '12345678', 1.0, 100.0, 100.0)
    shipment.items.all.return_value = [item]

    xml_bytes = build_dce_xml(shipment)
    assert b'<infDCe' in xml_bytes
    assert b'12345678000190' in xml_bytes


@pytest.mark.django_db
def test_build_access_key_uses_brt_month_from_dh_emi(db):
    _ = db
    shipment = MagicMock(spec=Shipment)
    shipment.participants_snapshot = {
        'emitter': {'city_ibge_code': '4106902', 'cnpj': '12345678000190'},
    }
    shipment.emit_snapshot = {'city_ibge_code': '4106902', 'cnpj': '12345678000190'}
    # 2026-05-01 01:30 UTC ainda é abril em BRT (-03:00)
    shipment.dh_emi = datetime.datetime(2026, 5, 1, 1, 30, tzinfo=datetime.UTC)
    shipment.serie = 1
    shipment.number = 1
    shipment.tp_emis = 1
    shipment.tp_emit = 2
    shipment.c_dc = '123456'

    build_access_key(shipment)
    # cUF(41) + AAMM(2604) + CNPJ...
    assert shipment.access_key.startswith('41260412345678000190')


@pytest.mark.django_db
def test_build_dce_xml_keeps_transportadora_block_when_tp_emit_transportadora(db):
    _ = db
    shipment = MagicMock(spec=Shipment)
    shipment.access_key = '41231012345678000190550010000001231123456789'
    shipment.tp_amb = 2
    shipment.tp_emis = 1
    shipment.tp_emit = Shipment.EmitType.TRANSPORTADORA
    shipment.tp_transp = Shipment.TpTransp.PROPRIO
    shipment.transport_mode = 1
    shipment.serie = 1
    shipment.number = 123
    shipment.c_dc = '123456'
    shipment.c_dv = '9'
    shipment.dh_emi = datetime.datetime(2023, 10, 1, tzinfo=datetime.UTC)
    shipment.info_complementar = None
    shipment.info_fisco = None

    # bloco <emit> deve refletir o remetente
    shipment.emit_snapshot = {
        'city_ibge_code': '4106902',
        'city_uf': 'PR',
        'cnpj': '22222222000122',
        'document': '22222222000122',
        'document_type': 'cnpj',
        'name': 'Remetente XML',
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
            'cnpj': '11111111000191',
            'document': '11111111000191',
            'name': 'Transportadora XYZ',
        }
    }

    item = FakeItem(1, 'Produto', '12345678', 1.0, 100.0, 100.0)
    shipment.items.all.return_value = [item]

    xml_bytes = build_dce_xml(shipment)
    assert b'<Transportadora>' in xml_bytes
    assert b'<CNPJ>11111111000191</CNPJ>' in xml_bytes
    assert b'<emit><CNPJ>22222222000122</CNPJ>' in xml_bytes
    assert b'<CNPJTransp>' not in xml_bytes
