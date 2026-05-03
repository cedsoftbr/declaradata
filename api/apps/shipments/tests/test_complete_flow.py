"""
Teste de fluxo completo:
empresa → usuário → permissão → remessa → emissão → cancelamento.
"""

import datetime
from unittest.mock import patch

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.companies.crypto import encrypt_bytes, encrypt_str
from apps.core.factories import (
    CarrierFactory,
    CompanyFactory,
    PersonFactory,
    ProductFactory,
    RoleFactory,
    RolePermissionFactory,
    UserFactory,
)
from apps.persons.models import Person, PersonCertificate
from apps.shipments.models import Shipment
from apps.users.models import Role

TEST_ENCRYPTION_KEY = b'bzRPF4BuLW5-JGhZHs-m8wxaFinvPx_3Y3E437PvMa8='
RSA_KEY_SIZE = 2048


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def pfx_data():
    """Gera um certificado PFX autoassinado mínimo para testes."""
    password = 'senha_teste'
    # Use 2048 to satisfy modern SSL libraries
    key = rsa.generate_private_key(public_exponent=65537, key_size=RSA_KEY_SIZE)
    subj = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, 'BR'),
        x509.NameAttribute(NameOID.COMMON_NAME, 'test.declaradata.com.br'),
    ])
    cert = (
        x509
        .CertificateBuilder()
        .subject_name(subj)
        .issuer_name(subj)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.now(datetime.UTC))
        .not_valid_after(
            datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=1)
        )
        .sign(key, hashes.SHA256())
    )
    pfx = pkcs12.serialize_key_and_certificates(
        b'test',
        key,
        cert,
        None,
        serialization.BestAvailableEncryption(password.encode()),
    )
    return pfx, password


@pytest.fixture
def company_with_cert(pfx_data):
    """
    Empresa com certificado na Pessoa (emitente)
    criptografado com TEST_ENCRYPTION_KEY.
    """
    pfx_bytes, password = pfx_data
    company = CompanyFactory()
    # Pega a pessoa criada pelo sinal
    person = Person.objects.get(company=company, document=company.cnpj)
    person.is_emitente = True
    person.save()

    with override_settings(CERTIFICATE_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY):
        PersonCertificate.objects.create(
            person=person,
            cert_pfx=encrypt_bytes(pfx_bytes),
            cert_password=encrypt_str(password),
        )
    return company


@pytest.fixture
def emitter(company_with_cert):
    return Person.objects.get(
        company=company_with_cert, document=company_with_cert.cnpj
    )


@pytest.fixture
def dce_role(company_with_cert):
    """Role com permissão total de DCE para a empresa."""
    role = RoleFactory(company=company_with_cert)
    RolePermissionFactory(
        role=role,
        module=Role.Module.DCE,
        can_view=True,
        can_create=True,
        can_edit=True,
        can_delete=True,
    )
    return role


@pytest.fixture
def manager(company_with_cert, dce_role):
    """Usuário gestor da empresa com permissão DCE."""
    return UserFactory(
        company=company_with_cert,
        role=dce_role,
        can_manage_users=True,
    )


@pytest.fixture
def recipient(company_with_cert):
    return PersonFactory(company=company_with_cert)


@pytest.fixture
def sender(company_with_cert):
    return PersonFactory(company=company_with_cert)


@pytest.fixture
def carrier(company_with_cert):
    return CarrierFactory(company=company_with_cert)


@pytest.fixture
def product(company_with_cert):
    return ProductFactory(company=company_with_cert)


@pytest.fixture
def client_auth(manager):
    client = APIClient()
    client.force_authenticate(user=manager)
    return client


# ── Helpers ───────────────────────────────────────────────────────────────────


def _create_shipment_payload(  # noqa: PLR0913, PLR0917
    emitter, recipient, product, carrier, sender=None, company=None
):
    payload = {
        'emitter_id': emitter.pk,
        'sender_id': sender.pk if sender else None,
        'recipient_id': recipient.pk,
        'carrier_id': carrier.pk,
        'tp_emit': Shipment.EmitType.PROPRIO,
        'tp_amb': Shipment.Ambient.SIMULADO,
        'transport_mode': Shipment.TransportMode.RODOVIARIO,
        'tp_transp': Shipment.TpTransp.TERCEIRIZADO,
        'items': [
            {
                'product_id': product.pk,
                'x_prod': product.descricao,
                'ncm': product.ncm,
                'q_com': 2.0,
                'v_un_com': 50.0,
            }
        ],
    }
    if company:
        payload['company'] = company.pk
    return payload


# ── Testes ────────────────────────────────────────────────────────────────────


@pytest.fixture
def mock_storage():
    """Mock storage in both services and views."""
    with (
        patch('apps.shipments.services.R2Storage') as mock_s,
        patch('apps.shipments.views.R2Storage') as mock_v,
    ):
        instance_s = mock_s.return_value
        instance_v = mock_v.return_value
        instance_s.get_file.return_value = b'<xml/>'
        instance_v.get_file.return_value = b'<xml/>'
        yield (instance_s, instance_v)


@pytest.mark.django_db
class TestCompleteShipmentFlow:
    """Fluxo completo: criação → emissão → download → cancelamento."""

    @override_settings(CERTIFICATE_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
    def test_full_lifecycle(  # noqa: PLR0913, PLR0917
        self,
        client_auth,
        company_with_cert,
        emitter,
        sender,
        recipient,
        product,
        carrier,
        mock_storage,
    ):
        """
        Cobre:
        1. Criar remessa
        2. Emitir (Celery eager)
        3. Verificar snapshot consolidado
        4. Gerar download_token
        5. Baixar PDF e XML com token
        6. Cancelar
        """
        # 1. Criar remessa
        url = reverse('shipment-list')
        payload = _create_shipment_payload(
            emitter, recipient, product, carrier, sender=sender
        )
        response = client_auth.post(url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED, response.data
        shipment_id = response.data['id']

        # Verificar status inicial
        shipment = Shipment.objects.get(pk=shipment_id)
        assert shipment.status == Shipment.Status.DRAFT

        # 2. Emitir
        emit_url = reverse('shipment-emit', kwargs={'pk': shipment_id})
        response = client_auth.post(emit_url)
        assert response.status_code == status.HTTP_200_OK, response.data

        # Celery ALWAYS_EAGER — já processou de forma síncrona
        shipment.refresh_from_db()
        assert shipment.status == Shipment.Status.AUTHORIZED

        # 3. Snapshot consolidado
        assert shipment.participants_snapshot is not None
        assert 'emit' in shipment.participants_snapshot
        assert 'recipient' in shipment.participants_snapshot
        # Propriedades backward compat funcionam
        assert shipment.emit_snapshot['cnpj'] is not None
        assert shipment.recipient_snapshot['name'] == recipient.name

        # 4. Gerar download_token
        token_url = reverse('shipment-download-token', kwargs={'pk': shipment_id})
        response = client_auth.post(token_url)
        assert response.status_code == status.HTTP_200_OK
        token = response.data['token']
        assert response.data['expires_in'] == 3600

        # 5a. Baixar PDF com token (cliente anônimo)
        anon = APIClient()
        mock_pdf = b'%PDF-fake'
        with patch(
            'apps.shipments.pdf_generator.generate_dce_pdf', return_value=mock_pdf
        ):
            pdf_url = reverse('shipment-pdf', kwargs={'pk': shipment_id})
            response = anon.get(pdf_url, {'token': token})
        assert response.status_code == status.HTTP_200_OK
        assert response['Content-Type'] == 'application/pdf'

        # 5b. Baixar XML com token
        xml_url = reverse('shipment-xml', kwargs={'pk': shipment_id})
        response = anon.get(xml_url, {'token': token})
        assert response.status_code == status.HTTP_200_OK
        assert response['Content-Type'] == 'application/xml'

        # 6. Cancelar
        cancel_url = reverse('shipment-cancel', kwargs={'pk': shipment_id})
        response = client_auth.post(cancel_url)
        assert response.status_code == status.HTTP_200_OK, response.data

        shipment.refresh_from_db()
        assert shipment.status == Shipment.Status.CANCELLED

    @override_settings(CERTIFICATE_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
    def test_download_token_wrong_shipment_rejected(  # noqa: PLR0913, PLR0917
        self, client_auth, emitter, sender, recipient, product, carrier
    ):
        """Token gerado para remessa A não deve funcionar na remessa B."""
        # Cria e emite duas remessas
        url = reverse('shipment-list')
        r1 = client_auth.post(
            url,
            _create_shipment_payload(
                emitter, recipient, product, carrier, sender=sender
            ),
            format='json',
        )
        r2 = client_auth.post(
            url,
            _create_shipment_payload(
                emitter, recipient, product, carrier, sender=sender
            ),
            format='json',
        )
        assert r1.status_code == status.HTTP_201_CREATED
        assert r2.status_code == status.HTTP_201_CREATED

        id_a, id_b = r1.data['id'], r2.data['id']
        for pk in (id_a, id_b):
            # Forçar SIMULADO na criação se possível, ou mockar emit
            s = Shipment.objects.get(pk=pk)
            s.tp_amb = Shipment.Ambient.SIMULADO
            s.save()
            client_auth.post(reverse('shipment-emit', kwargs={'pk': pk}))

        # Token da remessa A
        token = client_auth.post(
            reverse('shipment-download-token', kwargs={'pk': id_a})
        ).data['token']

        # Tenta usar na remessa B — espera 401 ou 403
        anon = APIClient()
        response = anon.get(
            reverse('shipment-pdf', kwargs={'pk': id_b}), {'token': token}
        )
        assert response.status_code in {
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        }
