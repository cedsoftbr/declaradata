from django.utils import timezone

from .crypto import encrypt_bytes, encrypt_str


def store_company_certificate(company, pfx_bytes, password, cert_obj):
    """
    Cifra e armazena o certificado digital da empresa.
    """
    expires_at = cert_obj.not_valid_after_utc.date()

    company.cert_pfx = encrypt_bytes(pfx_bytes)
    company.cert_password = encrypt_str(password)
    company.cert_expires_at = expires_at
    company.cert_uploaded_at = timezone.now()
    company.save(
        update_fields=[
            'cert_pfx',
            'cert_password',
            'cert_expires_at',
            'cert_uploaded_at',
        ]
    )
    return company


def remove_company_certificate(company):
    """
    Remove o certificado digital armazenado da empresa.
    """
    company.cert_pfx = None
    company.cert_password = ''
    company.cert_expires_at = None
    company.cert_uploaded_at = None
    company.save(
        update_fields=[
            'cert_pfx',
            'cert_password',
            'cert_expires_at',
            'cert_uploaded_at',
        ]
    )
    return company
