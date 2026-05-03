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
from apps.companies.models import Company
from apps.core.factories import CarrierFactory, PersonCertificateFactory, PersonFactory
from apps.locations.models import City
from apps.persons.models import Person
from apps.products.models import Product
from apps.shipments.models import Shipment
from apps.users.models import Role, RolePermission, User

# Valid 32-byte base64 encoded key
TEST_ENCRYPTION_KEY = 'bzRPF4BuLW5-JGhZHs-m8wxaFinvPx_3Y3E437PvMa8='


@pytest.fixture
def mock_pfx_data():
    password = 'test_password'
    # Use 2048 bits
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, 'BR'),
        x509.NameAttribute(NameOID.COMMON_NAME, 'test.com'),
    ])
    cert = (
        x509
        .CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.now(datetime.UTC))
        .not_valid_after(
            datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=1)
        )
        .sign(private_key, hashes.SHA256())
    )
    pfx_bytes = pkcs12.serialize_key_and_certificates(
        b'test',
        private_key,
        cert,
        None,
        serialization.BestAvailableEncryption(password.encode()),
    )
    return pfx_bytes, password


@pytest.mark.django_db
class TestShipmentEmissionIntegration:
    def setup_method(self):
        self.city = City.objects.create(name='Curitiba', uf='PR', ibge_code='4106902')
        self.company = Company.objects.create(
            name='Emitente Teste', cnpj='12345678000190', city=self.city
        )
        self.company.refresh_from_db()

        # The signal create_self_person_on_company_creation already created a Person
        # for this company. We find it and make it an emitter.
        self.emitter = Person.objects.get(
            company=self.company, document=self.company.cnpj
        )
        self.emitter.is_emitente = True
        self.emitter.save()

        self.person = PersonFactory(
            company=self.company,
            name='Destinatário Teste',
            document='98765432000100',
            address_city=self.city,
        )

        self.product = Product.objects.create(
            company=self.company, descricao='Produto Teste', ncm='12345678'
        )

        self.carrier = CarrierFactory(company=self.company)
        self.sender = PersonFactory(
            company=self.company,
            name='Remetente Teste',
            document='11222333000181',
            address_city=self.city,
        )

        self.manager_role = Role.objects.create(
            company=self.company, name='Manager', can_manage_users=True
        )
        self.manager = User.objects.create_user(
            email='manager_integ@test.com',
            password='password123',
            company=self.company,
            role=self.manager_role,
            can_manage_users=True,
        )
        RolePermission.objects.create(
            role=self.manager_role,
            module=Role.Module.DCE,
            can_view=True,
            can_create=True,
            can_edit=True,
        )

    @override_settings(CERTIFICATE_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
    def test_full_emission_flow(self, mock_pfx_data):
        pfx_bytes, password = mock_pfx_data
        client = APIClient()
        client.force_authenticate(user=self.manager)

        PersonCertificateFactory(
            person=self.emitter,
            cert_pfx=encrypt_bytes(pfx_bytes),
            cert_password=encrypt_str(password),
        )

        url = reverse('shipment-list')
        data = {
            'company': self.company.pk,
            'emitter_id': self.emitter.pk,
            'sender_id': self.sender.pk,
            'recipient_id': self.person.pk,
            'carrier_id': self.carrier.pk,
            'tp_emit': 2,
            'tp_amb': 3,  # Use SIMULADO
            'transport_mode': 1,
            'tp_transp': 2,
            'items': [
                {
                    'product_id': self.product.pk,
                    'x_prod': self.product.descricao,
                    'ncm': self.product.ncm,
                    'q_com': 1.0,
                    'v_un_com': 100.0,
                }
            ],
        }

        with (
            patch('apps.shipments.services.R2Storage') as mock_s,
            patch('apps.shipments.views.R2Storage') as mock_v,
        ):
            mock_s.return_value.get_file.return_value = b'<xml/>'
            mock_v.return_value.get_file.return_value = b'<xml/>'

            response = client.post(url, data, format='json')
            assert response.status_code == status.HTTP_201_CREATED, response.data
            shipment_id = response.data['id']

            # 3. Emit
            emit_url = reverse('shipment-emit', kwargs={'pk': shipment_id})
            response = client.post(emit_url)
            assert response.status_code == status.HTTP_200_OK

            # 4. PDF
            pdf_url = reverse('shipment-pdf', kwargs={'pk': shipment_id})
            with patch(
                'apps.shipments.pdf_generator.generate_dce_pdf', return_value=b'pdf'
            ):
                response = client.get(pdf_url)
            assert response.status_code == status.HTTP_200_OK

            # 5. XML
            xml_url = reverse('shipment-xml', kwargs={'pk': shipment_id})
            response = client.get(xml_url)
            assert response.status_code == status.HTTP_200_OK

            # 6. Cancel
            cancel_url = reverse('shipment-cancel', kwargs={'pk': shipment_id})
            response = client.post(cancel_url)
            assert response.status_code == status.HTTP_200_OK

            # Recarrega para ver status final
            shipment = Shipment.objects.get(pk=shipment_id)
            assert shipment.status == Shipment.Status.CANCELLED

    def test_shipment_list(self):
        url = reverse('shipment-list')
        client = APIClient()
        client.force_authenticate(user=self.manager)
        response = client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_shipment_update_not_draft_error(self):
        shipment = Shipment.objects.create(
            company=self.company,
            emitter=self.emitter,
            recipient=self.person,
            status=Shipment.Status.AUTHORIZED,
            number=2,
            c_dc='2',
            tp_emit=1,
            transport_mode=1,
        )
        client = APIClient()
        client.force_authenticate(user=self.manager)
        url = reverse('shipment-detail', kwargs={'pk': shipment.id})
        response = client.patch(url, {'tp_amb': 1})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_shipment_delete(self):
        shipment = Shipment.objects.create(
            company=self.company,
            emitter=self.emitter,
            recipient=self.person,
            status=Shipment.Status.DRAFT,
            # number=3,  # MUST be None to allow deletion
            c_dc='3',
            tp_emit=1,
            transport_mode=1,
        )
        RolePermission.objects.filter(
            role=self.manager_role, module=Role.Module.DCE
        ).update(can_delete=True)
        client = APIClient()
        client.force_authenticate(user=self.manager)
        url = reverse('shipment-detail', kwargs={'pk': shipment.id})
        response = client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_shipment_download_xml_no_xml_error(self):
        shipment = Shipment.objects.create(
            company=self.company,
            emitter=self.emitter,
            recipient=self.person,
            status=Shipment.Status.DRAFT,
            number=4,
            c_dc='4',
            tp_emit=1,
            transport_mode=1,
        )
        api_client = APIClient()
        api_client.force_authenticate(user=self.manager)
        url = reverse('shipment-xml', kwargs={'pk': shipment.id})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_shipment_download_pdf_draft_error(self):
        shipment = Shipment.objects.create(
            company=self.company,
            emitter=self.emitter,
            recipient=self.person,
            status=Shipment.Status.DRAFT,
            number=5,
            c_dc='5',
            tp_emit=1,
            tp_amb=Shipment.Ambient.HOMOLOGACAO,  # Não simulado
            transport_mode=1,
        )
        api_client = APIClient()
        api_client.force_authenticate(user=self.manager)
        url = reverse('shipment-pdf', kwargs={'pk': shipment.id})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
