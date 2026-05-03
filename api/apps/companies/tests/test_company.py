import datetime

import pytest
from cryptography import x509
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.companies.crypto import (
    decrypt_bytes,
    decrypt_str,
    encrypt_bytes,
    encrypt_str,
)
from apps.companies.models import Company
from apps.persons.models import Person, PersonCertificate
from apps.users.models import Role, User


class CryptoTests(TestCase):
    # Generates a valid Fernet key for testing
    TEST_KEY = Fernet.generate_key().decode()

    @staticmethod
    @override_settings(CERTIFICATE_ENCRYPTION_KEY=TEST_KEY)
    def test_string_encryption_decryption():
        original_text = 'minha-senha-secreta-123'
        encrypted = encrypt_str(original_text)

        # Must be different from original
        assert original_text != encrypted

        decrypted = decrypt_str(encrypted)

        # Must be equal to original after decryption
        assert original_text == decrypted

    @staticmethod
    @override_settings(CERTIFICATE_ENCRYPTION_KEY=TEST_KEY)
    def test_bytes_encryption_decryption():
        original_bytes = b'\x01\x02\x03\x04\x05test-bytes'
        encrypted = encrypt_bytes(original_bytes)

        assert original_bytes != encrypted

        decrypted = decrypt_bytes(encrypted)
        assert original_bytes == decrypted

    @staticmethod
    def test_missing_key_raises_error():
        with override_settings(CERTIFICATE_ENCRYPTION_KEY=None):
            with pytest.raises(RuntimeError) as cm:
                encrypt_str('test')
            assert 'CERTIFICATE_ENCRYPTION_KEY não configurada' in str(cm.value)


@override_settings(CERTIFICATE_ENCRYPTION_KEY=Fernet.generate_key().decode())
class CertificateUploadTests(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(
            name='Test Company', cnpj='12.345.678/0001-90'
        )
        self.person = Person.objects.get(
            company=self.company, document=self.company.cnpj
        )
        self.person.is_emitente = True
        self.person.save()

        self.manager_role = Role.objects.create(
            company=self.company, name='Manager', can_manage_users=True
        )
        self.manager = User.objects.create_user(
            username='manager@test.com',
            email='manager@test.com',
            password='password123',
            company=self.company,
            role=self.manager_role,
            can_manage_users=True,
        )
        self.client.force_authenticate(user=self.manager)

    @staticmethod
    def _generate_mock_pfx(password: str) -> bytes:
        # Generate a private key
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

        # Generate a certificate
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, 'test.declaradata.com ICP-Brasil'),
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
                datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=10)
            )
            .sign(private_key, hashes.SHA256())
        )

        # Serialize to PKCS12
        return pkcs12.serialize_key_and_certificates(
            b'test cert',
            private_key,
            cert,
            None,
            serialization.BestAvailableEncryption(password.encode()),
        )

    def test_certificate_upload_success(self):
        password = 'certpassword123'
        pfx_bytes = self._generate_mock_pfx(password)

        # We need to simulate a file upload
        cert_file = SimpleUploadedFile(
            'cert.pfx', pfx_bytes, content_type='application/x-pkcs12'
        )

        url = reverse('person-certificate', kwargs={'pk': self.person.pk})
        response = self.client.post(
            url, {'certificate': cert_file, 'password': password}, format='multipart'
        )

        assert response.status_code == status.HTTP_200_OK

        # Verify certificate was updated
        self.person.refresh_from_db()
        assert hasattr(self.person, 'certificate')
        assert self.person.certificate.cert_pfx is not None
        assert self.person.certificate.cert_password is not None

        # Test if we can decrypt the password
        decrypted_password = decrypt_str(self.person.certificate.cert_password)
        assert decrypted_password == password

    def test_certificate_upload_invalid_password(self):
        real_password = 'certpassword123'
        wrong_password = 'wrongpassword'
        pfx_bytes = self._generate_mock_pfx(real_password)

        cert_file = SimpleUploadedFile(
            'cert.pfx', pfx_bytes, content_type='application/x-pkcs12'
        )

        url = reverse('person-certificate', kwargs={'pk': self.person.pk})
        response = self.client.post(
            url,
            {'certificate': cert_file, 'password': wrong_password},
            format='multipart',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert (
            'Arquivo inválido ou senha incorreta'
            in response.data['non_field_errors'][0]
        )

    def test_certificate_status_and_delete(self):
        password = 'certpassword123'
        pfx_bytes = self._generate_mock_pfx(password)
        PersonCertificate.objects.create(
            person=self.person,
            cert_pfx=encrypt_bytes(pfx_bytes),
            cert_password=encrypt_str(password),
        )

        # Test Status
        url_status = reverse('person-certificate-status', kwargs={'pk': self.person.pk})
        response = self.client.get(url_status)
        assert response.status_code == status.HTTP_200_OK
        assert response.data['has_certificate']

        # Test Delete
        url_delete = reverse('person-certificate', kwargs={'pk': self.person.pk})
        response = self.client.delete(url_delete)
        assert response.status_code == status.HTTP_204_NO_CONTENT

        self.person.refresh_from_db()
        assert not hasattr(self.person, 'certificate')

    def test_manager_access_other_company_denied(self):
        other_company = Company.objects.create(name='Other', cnpj='99.999.999/0001-99')
        other_person = Person.objects.get(
            company=other_company, document=other_company.cnpj
        )
        url = reverse('person-certificate-status', kwargs={'pk': other_person.pk})
        response = self.client.get(url)
        # 404 because the queryset is filtered by company,
        # so it doesn't even "find" the object
        assert response.status_code in {
            status.HTTP_403_FORBIDDEN,
            status.HTTP_404_NOT_FOUND,
        }

    def test_superadmin_access_any_company(self):
        superadmin = User.objects.create_superuser(
            username='super@test.com', email='super@test.com', password='password123'
        )
        self.client.force_authenticate(user=superadmin)
        url = reverse('person-certificate-status', kwargs={'pk': self.person.pk})
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_patch_certificate_status_syncs_current_ambient(self):
        self.company.environment = Company.Ambient.SIMULADO
        self.company.current_ambient = Company.Ambient.SIMULADO
        self.company.save(update_fields=['environment', 'current_ambient'])

        url_status = reverse('company-environment', kwargs={'pk': self.company.pk})
        response = self.client.patch(
            url_status, {'environment': Company.Ambient.HOMOLOGACAO}, format='json'
        )

        assert response.status_code == status.HTTP_200_OK

        self.company.refresh_from_db()
        assert self.company.environment == Company.Ambient.HOMOLOGACAO
        assert self.company.current_ambient == Company.Ambient.HOMOLOGACAO
