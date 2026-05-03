import base64
import gzip
import xml.etree.ElementTree as ET
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa

from apps.core.exceptions import SefazRejectError, SefazTransientError
from apps.core.factories import CompanyFactory, PersonFactory
from apps.shipments.models import Shipment
from apps.shipments.sefaz_client import SefazClient


@pytest.fixture
def company(db):
    return CompanyFactory()


@pytest.fixture
def emitter(company):
    return PersonFactory(company=company, is_emitente=True)


@pytest.fixture
def sefaz_client(company, emitter):
    return SefazClient(company, emitter)


class TestSefazClient:
    @patch('apps.shipments.sefaz_client.SefazClient._soap_post')
    def test_check_status_success(self, mock_post, sefaz_client):
        mock_post.return_value = b"""<?xml version="1.0" encoding="utf-8"?>
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
            <soapenv:Body>
                <retConsStatServ xmlns="http://www.portalfiscal.inf.br/dce">
                    <tpAmb>2</tpAmb>
                    <cStat>107</cStat>
                    <xMotivo>Servico em Operacao</xMotivo>
                    <dh_recbto>2026-04-18T22:00:00-03:00</dh_recbto>
                </retConsStatServ>
            </soapenv:Body>
        </soapenv:Envelope>
        """
        res = sefaz_client.check_status(tp_amb=2)
        assert res['c_stat'] == '107'
        assert res['x_motivo'] == 'Servico em Operacao'

    @patch('apps.shipments.sefaz_client.SefazClient._soap_post')
    def test_authorize_dce_success(self, mock_post, sefaz_client):
        mock_post.return_value = b"""<?xml version="1.0" encoding="utf-8"?>
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
            <soapenv:Body>
                <retDCeAutorizacao xmlns="http://www.portalfiscal.inf.br/dce">
                    <cStat>100</cStat>
                    <xMotivo>Autorizado</xMotivo>
                    <nProt>1234567890123456</nProt>
                    <dhRecbto>2026-04-18T22:10:00-03:00</dhRecbto>
                </retDCeAutorizacao>
            </soapenv:Body>
        </soapenv:Envelope>
        """
        shipment = MagicMock(spec=Shipment)
        shipment.n_prot = ''
        shipment.tp_amb = 2

        n_prot, dh_recbto = sefaz_client.authorize_dce(shipment, b'<xml/>')
        assert n_prot == '1234567890123456'
        assert isinstance(dh_recbto, datetime)

    @patch('apps.shipments.sefaz_client.SefazClient._soap_post')
    def test_authorize_dce_rejection(self, mock_post, sefaz_client):
        mock_post.return_value = b"""<?xml version="1.0" encoding="utf-8"?>
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
            <soapenv:Body>
                <retDCeAutorizacao xmlns="http://www.portalfiscal.inf.br/dce">
                    <cStat>215</cStat>
                    <xMotivo>Falha no esquema XML</xMotivo>
                </retDCeAutorizacao>
            </soapenv:Body>
        </soapenv:Envelope>
        """
        shipment = MagicMock(spec=Shipment)
        shipment.n_prot = ''
        shipment.tp_amb = 2

        with pytest.raises(SefazRejectError) as exc:
            sefaz_client.authorize_dce(shipment, b'<xml/>')
        assert exc.value.c_stat == '215'
        assert 'Falha no esquema XML' in str(exc.value)

    @patch('apps.shipments.sefaz_client.SefazClient._soap_post')
    def test_authorize_dce_transient_error(self, mock_post, sefaz_client):
        mock_post.return_value = b"""<?xml version="1.0" encoding="utf-8"?>
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
            <soapenv:Body>
                <retDCeAutorizacao xmlns="http://www.portalfiscal.inf.br/dce">
                    <cStat>108</cStat>
                    <xMotivo>Servico Paralisado Momentaneamente</xMotivo>
                </retDCeAutorizacao>
            </soapenv:Body>
        </soapenv:Envelope>
        """
        shipment = MagicMock(spec=Shipment)
        shipment.n_prot = ''
        shipment.tp_amb = 2

        with pytest.raises(SefazTransientError) as exc:
            sefaz_client.authorize_dce(shipment, b'<xml/>')
        assert exc.value.c_stat == '108'

    @patch('apps.shipments.sefaz_client.load_certificate')
    @patch('apps.shipments.sefaz_client.SefazClient._soap_post')
    def test_cancel_dce_success(self, mock_post, mock_load_cert, sefaz_client):
        # Mocking certificate load for XML signing
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = x509.Name([x509.NameAttribute(x509.NameOID.COMMON_NAME, 'test')])
        cert = (
            x509
            .CertificateBuilder()
            .subject_name(subject)
            .issuer_name(subject)
            .public_key(key.public_key())
            .serial_number(1)
            .not_valid_before(datetime.now(UTC))
            .not_valid_after(datetime.now(UTC))
            .sign(key, hashes.SHA256())
        )
        mock_load_cert.return_value = (key, cert, [])

        mock_post.return_value = b"""<?xml version="1.0" encoding="utf-8"?>
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
            <soapenv:Body>
                <retEvento xmlns="http://www.portalfiscal.inf.br/dce">
                    <cStat>135</cStat>
                    <xMotivo>Evento registrado e vinculado a DC-e</xMotivo>
                    <nProt>9876543210987654</nProt>
                    <dhRegEvento>2026-04-18T22:20:00-03:00</dhRegEvento>
                </retEvento>
            </soapenv:Body>
        </soapenv:Envelope>
        """
        shipment = MagicMock(spec=Shipment)
        shipment.access_key = '41260412345678000190570010000000011000000018'
        shipment.n_prot = '1234567890123456'
        shipment.tp_amb = 2
        shipment.tp_emit = 2
        shipment.emit_snapshot = {'document': '12345678000190'}

        n_prot, dh_cancel, xml_env = sefaz_client.cancel_dce(
            shipment, 'Justificativa com mais de 15 caracteres'
        )
        assert n_prot == '9876543210987654'
        assert isinstance(dh_cancel, datetime)
        assert b'evCancDCe' in xml_env

    @patch('apps.shipments.sefaz_client.SefazClient._soap_post')
    def test_distribute_dce_success(self, mock_post, sefaz_client):
        # Create a fake docZip content (Gzipped resDCe XML)
        dce_xml = b"""<resDCe xmlns="http://www.portalfiscal.inf.br/dce" versao="1.00">
            <chDCe>41260412345678000190570010000000011000000018</chDCe>
            <nProt>1234567890123456</nProt>
            <dhRecbto>2026-04-18T22:30:00-03:00</dhRecbto>
        </resDCe>"""
        gz_xml = gzip.compress(dce_xml)
        b64_xml = base64.b64encode(gz_xml).decode()

        mock_post.return_value = f"""<?xml version="1.0" encoding="utf-8"?>
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
            <soapenv:Body>
                <retDistDCe xmlns="http://www.portalfiscal.inf.br/dce">
                    <cStat>138</cStat>
                    <xMotivo>Documento localizado</xMotivo>
                    <ultNSU>000000000000123</ultNSU>
                    <loteDistDCe>
                        <docZip NSU="000000000000123" schema="resDCe_v1.00.xsd">
                            {b64_xml}
                        </docZip>
                    </loteDistDCe>
                </retDistDCe>
            </soapenv:Body>
        </soapenv:Envelope>
        """.encode()

        res = sefaz_client.distribute_dce('0', tp_amb=2)
        assert res.ult_nsu == '000000000000123'
        assert len(res.procs) == 1
        assert res.procs[0].tipo == 'DCe'
        assert res.procs[0].ch_dce == '41260412345678000190570010000000011000000018'
        assert res.procs[0].n_prot == '1234567890123456'

    @patch('apps.shipments.sefaz_client.load_certificate')
    def test_build_cancel_xml_includes_cnpj_autor_for_cpf_user(
        self, mock_load_cert, sefaz_client
    ):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = x509.Name([x509.NameAttribute(x509.NameOID.COMMON_NAME, 'test')])
        cert = (
            x509
            .CertificateBuilder()
            .subject_name(subject)
            .issuer_name(subject)
            .public_key(key.public_key())
            .serial_number(1)
            .not_valid_before(datetime.now(UTC))
            .not_valid_after(datetime.now(UTC))
            .sign(key, hashes.SHA256())
        )
        mock_load_cert.return_value = (key, cert, [])

        shipment = MagicMock(spec=Shipment)
        shipment.access_key = '41260412345678000190570010000000011000000018'
        shipment.n_prot = '1234567890123456'
        shipment.tp_amb = 1
        shipment.tp_emit = 3
        shipment.emit_snapshot = {'document': '31345685866'}

        xml_payload, _ = sefaz_client._build_cancel_xml(
            shipment,
            'Justificativa com mais de 15 caracteres',
            '2026-04-21T13:00:33-03:00',
        )

        ns = {'d': 'http://www.portalfiscal.inf.br/dce'}
        root = ET.fromstring(xml_payload)
        assert (
            root.findtext('.//d:CNPJAutor', namespaces=ns)
            == sefaz_client.emitter.document
        )
        assert root.findtext('.//d:CPFUsEmit', namespaces=ns) == '31345685866'

    @patch('apps.shipments.sefaz_client.load_certificate')
    def test_build_cancel_xml_uses_emit_snapshot_as_user_emitente(
        self, mock_load_cert, sefaz_client
    ):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = x509.Name([x509.NameAttribute(x509.NameOID.COMMON_NAME, 'test')])
        cert = (
            x509
            .CertificateBuilder()
            .subject_name(subject)
            .issuer_name(subject)
            .public_key(key.public_key())
            .serial_number(1)
            .not_valid_before(datetime.now(UTC))
            .not_valid_after(datetime.now(UTC))
            .sign(key, hashes.SHA256())
        )
        mock_load_cert.return_value = (key, cert, [])

        shipment = MagicMock(spec=Shipment)
        shipment.access_key = '43260490739624000118990010000000031301540327'
        shipment.n_prot = '3432600000656208'
        shipment.tp_amb = 1
        shipment.tp_emit = 3
        shipment.participants_snapshot = {
            'emitter': {'cnpj': '90739624000118', 'document': '90739624000118'}
        }
        shipment.emit_snapshot = {'document': '31345685866'}

        xml_payload, _ = sefaz_client._build_cancel_xml(
            shipment,
            'Justificativa com mais de 15 caracteres',
            '2026-04-21T13:02:45-03:00',
        )

        ns = {'d': 'http://www.portalfiscal.inf.br/dce'}
        root = ET.fromstring(xml_payload)
        assert root.findtext('.//d:CNPJAutor', namespaces=ns) == '90739624000118'
        assert root.findtext('.//d:CPFUsEmit', namespaces=ns) == '31345685866'
        assert root.findtext('.//d:CNPJUsEmit', namespaces=ns) is None

    @patch('apps.shipments.sefaz_client.load_certificate')
    def test_build_cancel_xml_falls_back_to_emitter_actor_when_emit_missing(
        self, mock_load_cert, sefaz_client
    ):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = x509.Name([x509.NameAttribute(x509.NameOID.COMMON_NAME, 'test')])
        cert = (
            x509
            .CertificateBuilder()
            .subject_name(subject)
            .issuer_name(subject)
            .public_key(key.public_key())
            .serial_number(1)
            .not_valid_before(datetime.now(UTC))
            .not_valid_after(datetime.now(UTC))
            .sign(key, hashes.SHA256())
        )
        mock_load_cert.return_value = (key, cert, [])

        shipment = MagicMock(spec=Shipment)
        shipment.access_key = '43260490739624000118990010000000031301540327'
        shipment.n_prot = '3432600000656208'
        shipment.tp_amb = 1
        shipment.tp_emit = 3
        shipment.participants_snapshot = {
            'emitter': {'cnpj': '90739624000118', 'document': '90739624000118'}
        }
        shipment.emit_snapshot = {}

        xml_payload, _ = sefaz_client._build_cancel_xml(
            shipment,
            'Justificativa com mais de 15 caracteres',
            '2026-04-21T13:10:00-03:00',
        )

        ns = {'d': 'http://www.portalfiscal.inf.br/dce'}
        root = ET.fromstring(xml_payload)
        assert root.findtext('.//d:CNPJAutor', namespaces=ns) == '90739624000118'
        assert (
            root.findtext('.//d:CNPJUsEmit', namespaces=ns)
            == sefaz_client.emitter.document
        )
        assert root.findtext('.//d:CPFUsEmit', namespaces=ns) is None

    @patch('apps.shipments.sefaz_client.load_certificate')
    @patch('apps.shipments.sefaz_client.SefazClient._soap_post')
    def test_cancel_dce_cstat_213_is_reject_error(
        self, mock_post, mock_load_cert, sefaz_client
    ):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = x509.Name([x509.NameAttribute(x509.NameOID.COMMON_NAME, 'test')])
        cert = (
            x509
            .CertificateBuilder()
            .subject_name(subject)
            .issuer_name(subject)
            .public_key(key.public_key())
            .serial_number(1)
            .not_valid_before(datetime.now(UTC))
            .not_valid_after(datetime.now(UTC))
            .sign(key, hashes.SHA256())
        )
        mock_load_cert.return_value = (key, cert, [])
        mock_post.return_value = b"""<?xml version="1.0" encoding="utf-8"?>
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
            <soapenv:Body>
                <retEvento xmlns="http://www.portalfiscal.inf.br/dce">
                    <cStat>213</cStat>
                    <xMotivo>Usuario emitente diverge do certificado</xMotivo>
                </retEvento>
            </soapenv:Body>
        </soapenv:Envelope>
        """

        shipment = MagicMock(spec=Shipment)
        shipment.access_key = '43260490739624000118990010000000031301540327'
        shipment.n_prot = '3432600000656208'
        shipment.tp_amb = 1
        shipment.tp_emit = 3
        shipment.participants_snapshot = {
            'emitter': {'cnpj': '90739624000118', 'document': '90739624000118'}
        }
        shipment.emit_snapshot = {'document': '31345685866'}

        with pytest.raises(SefazRejectError) as exc:
            sefaz_client.cancel_dce(shipment, 'Justificativa com mais de 15 caracteres')
        assert exc.value.c_stat == '213'
