import datetime
from unittest.mock import ANY, patch

import pytest
from cryptography import x509
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from django.test import override_settings
from django.utils import timezone

from apps.companies.crypto import encrypt_bytes, encrypt_str
from apps.core.exceptions import ShipmentCancellationError, ShipmentEmissionError
from apps.core.factories import (
    CompanyFactory,
    PersonCertificateFactory,
    PersonFactory,
    ShipmentFactory,
)
from apps.shipments.models import Shipment
from apps.shipments.services import (
    cancel_shipment,
    collect_participants_snapshot,
    emit_shipment,
)

TEST_ENCRYPTION_KEY = Fernet.generate_key().decode()


@pytest.fixture
def base_data(db):
    _ = db
    with override_settings(CERTIFICATE_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY):
        company = CompanyFactory()
        person = PersonFactory(company=company)
        sender = PersonFactory(company=company)
        emitter = PersonFactory(company=company, is_emitente=True)
        # Certificate is now on Person (emitter)
        PersonCertificateFactory(
            person=emitter,
            cert_pfx=encrypt_bytes(b'fake-pfx-data'),
            cert_password=encrypt_str('password'),
        )
    return None, company, person, emitter, sender


@pytest.mark.django_db
@override_settings(CERTIFICATE_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
def test_emit_shipment_invalid_status(base_data):
    _, company, person, emitter, sender = base_data
    shipment = ShipmentFactory(
        company=company,
        sender=sender,
        recipient=person,
        emitter=emitter,
        status=Shipment.Status.AUTHORIZED,
    )
    with pytest.raises(
        ShipmentEmissionError, match=r'Apenas remessas em rascunho podem ser emitidas\.'
    ):
        emit_shipment(shipment)


@pytest.mark.django_db
@override_settings(CERTIFICATE_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
def test_emit_shipment_no_certificate(db):
    _ = db
    with override_settings(CERTIFICATE_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY):
        company = CompanyFactory()
        person = PersonFactory(company=company)
        sender = PersonFactory(company=company)
        emitter = PersonFactory(company=company, is_emitente=True)
        # tp_amb=2 é HOMOLOGACAO. Se a empresa também estiver em HOMOLOGACAO,
        # o serviço tentará usar o certificado real e falhará se não houver cert_pfx.
        company.environment = 2
        company.save()

    shipment = ShipmentFactory(
        company=company,
        sender=sender,
        recipient=person,
        emitter=emitter,
        status=Shipment.Status.DRAFT,
        tp_amb=2,
    )

    with pytest.raises(
        ShipmentEmissionError,
        match=r'O emitente não possui certificado digital cadastrado\.',
    ):
        emit_shipment(shipment)


@pytest.mark.django_db
def test_cancel_shipment_invalid_status(base_data):
    _, _, person, emitter, sender = base_data
    shipment = ShipmentFactory(
        status=Shipment.Status.DRAFT, sender=sender, recipient=person, emitter=emitter
    )
    with pytest.raises(
        ShipmentCancellationError,
        match=r'Apenas remessas autorizadas podem ser canceladas\.',
    ):
        cancel_shipment(shipment)


@pytest.mark.django_db
@override_settings(CERTIFICATE_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
def test_emit_shipment_full_flow_success(base_data):
    _, company, person, emitter, sender = base_data
    # Use Ambient.SIMULADO (3) to avoid real SEFAZ mTLS logic
    shipment = ShipmentFactory(
        company=company,
        sender=sender,
        recipient=person,
        emitter=emitter,
        status=Shipment.Status.DRAFT,
        tp_amb=3,
    )

    # Use real key and cert objects to avoid TypeErrors in signxml
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([x509.NameAttribute(x509.NameOID.COMMON_NAME, 'test')])
    cert = (
        x509
        .CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(timezone.now() - datetime.timedelta(days=1))
        .not_valid_after(timezone.now() + datetime.timedelta(days=1))
        .sign(private_key, hashes.SHA256())
    )

    with (
        patch(
            'apps.shipments.services.load_person_certificate',
            return_value=(private_key, cert, []),
        ),
        patch('apps.shipments.services.generate_dce_pdf', return_value=b'pdf bytes'),
        patch('apps.shipments.services.R2Storage') as mock_storage_cls,
    ):
        mock_storage = mock_storage_cls.return_value
        emit_shipment(shipment)

    assert shipment.status == Shipment.Status.AUTHORIZED
    assert shipment.protocol == 'SIMULADO'
    assert 'shipments/' in shipment.xml_key
    assert 'shipments/' in shipment.pdf_key
    assert mock_storage.upload_file.call_count == 2


@pytest.mark.django_db
def test_cancel_shipment_success(base_data):
    _, company, person, emitter, sender = base_data
    shipment = ShipmentFactory(
        company=company,
        sender=sender,
        recipient=person,
        emitter=emitter,
        status=Shipment.Status.AUTHORIZED,
        tp_amb=3,  # SIMULADO
    )

    cancel_shipment(shipment)
    assert shipment.status == Shipment.Status.CANCELLED


@pytest.mark.django_db
@override_settings(CERTIFICATE_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
def test_cancel_shipment_saves_cancel_xml_in_r2(base_data):
    _, company, person, emitter, sender = base_data
    shipment = ShipmentFactory(
        company=company,
        sender=sender,
        recipient=person,
        emitter=emitter,
        status=Shipment.Status.AUTHORIZED,
        access_key='41260412345678000190570010000000011000000018',
        n_prot='123456789012345',
        tp_amb=2,  # HOMOLOGACAO -> triggers SefazClient.cancel_dce
    )

    with (
        patch(
            'apps.shipments.services.SefazClient.cancel_dce',
            return_value=('999999999999999', timezone.now(), b'<envEvento/>'),
        ),
        patch('apps.shipments.services.R2Storage') as mock_storage_cls,
    ):
        mock_storage = mock_storage_cls.return_value
        cancel_shipment(shipment, justificativa='Justificativa válida para cancelar')

    assert shipment.status == Shipment.Status.CANCELLED
    assert shipment.cancel_xml_key
    assert '/canc/' in shipment.cancel_xml_key
    assert mock_storage.upload_file.call_count == 2
    mock_storage.upload_file.assert_any_call(
        b'<envEvento/>',
        shipment.cancel_xml_key,
        'application/xml',
    )
    mock_storage.upload_file.assert_any_call(
        ANY,
        shipment.pdf_key,
        'application/pdf',
    )


@pytest.mark.django_db
@override_settings(CERTIFICATE_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
def test_emit_shipment_xml_builder_error(base_data):
    _, company, person, emitter, sender = base_data
    shipment = ShipmentFactory(
        company=company,
        sender=sender,
        recipient=person,
        emitter=emitter,
        status=Shipment.Status.DRAFT,
    )

    # Need a real-ish cert for sign_dce_xml if we don't mock it
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([x509.NameAttribute(x509.NameOID.COMMON_NAME, 'test')])
    cert = (
        x509
        .CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(timezone.now() - datetime.timedelta(days=1))
        .not_valid_after(timezone.now() + datetime.timedelta(days=1))
        .sign(private_key, hashes.SHA256())
    )

    with (
        patch(
            'apps.shipments.services.load_person_certificate',
            return_value=(private_key, cert, []),
        ),
        patch(
            'apps.shipments.services.build_dce_xml', side_effect=Exception('XML Error')
        ),
        pytest.raises(ShipmentEmissionError, match=r'Erro na emissão: XML Error'),
    ):
        emit_shipment(shipment)


@pytest.mark.django_db
@override_settings(CERTIFICATE_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
def test_emit_shipment_certificate_load_error(base_data):
    _, company, person, emitter, sender = base_data
    shipment = ShipmentFactory(
        company=company,
        sender=sender,
        recipient=person,
        emitter=emitter,
        status=Shipment.Status.DRAFT,
    )

    with (
        patch(
            'apps.shipments.services.load_person_certificate',
            side_effect=Exception('Load Error'),
        ),
        pytest.raises(ShipmentEmissionError, match=r'Erro na emissão: Load Error'),
    ):
        emit_shipment(shipment)


@pytest.mark.django_db
@override_settings(CERTIFICATE_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
def test_emit_shipment_unknown_error(base_data):
    _, company, person, emitter, sender = base_data
    shipment = ShipmentFactory(
        company=company,
        sender=sender,
        recipient=person,
        emitter=emitter,
        status=Shipment.Status.DRAFT,
    )

    with (
        patch(
            'apps.shipments.services.load_person_certificate',
            side_effect=Exception('Unknown Error'),
        ),
        pytest.raises(ShipmentEmissionError, match=r'Erro na emissão: Unknown Error'),
    ):
        emit_shipment(shipment)


@pytest.mark.django_db
def test_collect_snapshot_always_uses_sender_as_emit(base_data):
    _, company, recipient, emitter, _ = base_data
    sender = PersonFactory(company=company, document='11222333000181')
    shipment = ShipmentFactory(
        company=company,
        emitter=emitter,
        sender=sender,
        recipient=recipient,
        tp_emit=Shipment.EmitType.PROPRIO,
        tp_transp=Shipment.TpTransp.TERCEIRIZADO,
        status=Shipment.Status.DRAFT,
    )

    snapshots = collect_participants_snapshot(shipment, strict=True)
    assert snapshots.get('sender') is not None
    assert snapshots.get('emit') is not None
    assert snapshots.get('emitter') is not None
    assert snapshots['emit']['document'] == snapshots['sender']['document']
    assert snapshots['emit']['name'] == snapshots['sender']['name']
    assert snapshots['emitter']['document'] != snapshots['emit']['document']


@pytest.mark.django_db
def test_collect_snapshot_requires_sender_for_emit_composition(base_data):
    _, company, recipient, emitter, _ = base_data
    shipment = ShipmentFactory(
        company=company,
        emitter=emitter,
        sender=None,
        recipient=recipient,
        tp_emit=Shipment.EmitType.PROPRIO,
        tp_transp=Shipment.TpTransp.TERCEIRIZADO,
        status=Shipment.Status.DRAFT,
    )

    with pytest.raises(
        ShipmentEmissionError,
        match=(
            r'Remetente é obrigatório para emissão e composição '
            r'do emitente da DC-e\.'
        ),
    ):
        collect_participants_snapshot(shipment, strict=True)
