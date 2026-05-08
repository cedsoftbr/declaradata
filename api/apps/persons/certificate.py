"""
Utilitário para carregar o certificado digital A1 de uma pessoa emitente.

Uso:
    from apps.persons.certificate import load_certificate

    private_key, cert, extra_certs = load_certificate(person)
    # use private_key e cert para assinar XMLs;
    # extra_certs são as ACs intermediárias do PFX
"""

from cryptography.hazmat.primitives.serialization import pkcs12
from django.utils import timezone

from apps.companies.crypto import decrypt_bytes, decrypt_str, encrypt_bytes, encrypt_str


def load_certificate(person):
    """
    Descriptografa e carrega o certificado A1 da pessoa emitente.

    Retorna (private_key, certificate, extra_certs) prontos para uso na assinatura.
    Lança ValueError se a pessoa não tiver certificado cadastrado.
    """
    cert_record = getattr(person, 'certificate', None)
    if not cert_record or not cert_record.cert_pfx:
        raise ValueError(
            f'Pessoa {person.name} não possui certificado digital cadastrado.'
        )

    pfx_bytes = decrypt_bytes(bytes(cert_record.cert_pfx))
    password = decrypt_str(cert_record.cert_password).encode()

    private_key, cert, additional_certs = pkcs12.load_key_and_certificates(
        pfx_bytes, password
    )
    return private_key, cert, additional_certs or []


def store_person_certificate(person, pfx_bytes, password, cert_obj, environment=None):
    """
    Cifra e armazena (ou substitui) o certificado digital da pessoa emitente.
    """
    from .models import PersonCertificate  # noqa: PLC0415

    expires_at = cert_obj.not_valid_after_utc.date()

    cert_record, _ = PersonCertificate.objects.get_or_create(person=person)
    cert_record.cert_pfx = encrypt_bytes(pfx_bytes)
    cert_record.cert_password = encrypt_str(password)
    cert_record.cert_expires_at = expires_at
    cert_record.cert_uploaded_at = timezone.now()
    update_fields = [
        'cert_pfx',
        'cert_password',
        'cert_expires_at',
        'cert_uploaded_at',
        'updated_at',
    ]
    if environment is not None:
        cert_record.environment = environment
        update_fields.append('environment')
    cert_record.save(update_fields=update_fields)
    return cert_record


def remove_person_certificate(person):
    """
    Remove o certificado digital armazenado da pessoa emitente.
    """
    cert_record = getattr(person, 'certificate', None)
    if cert_record:
        cert_record.delete()
