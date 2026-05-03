"""
Utilitário de criptografia para dados sensíveis (certificados digitais).

Usa Fernet (AES-128-CBC + HMAC-SHA256) — criptografia simétrica autenticada.

Configuração:
    CERTIFICATE_ENCRYPTION_KEY no .env → chave Fernet em base64 (44 chars).

Gere uma nova chave com:
    python -c "from cryptography.fernet import Fernet; \
print(Fernet.generate_key().decode())"
"""

from cryptography.fernet import Fernet
from django.conf import settings


def _fernet() -> Fernet:
    key = getattr(settings, 'CERTIFICATE_ENCRYPTION_KEY', None)
    if not key:
        raise RuntimeError(
            'CERTIFICATE_ENCRYPTION_KEY não configurada. '
            'Gere uma chave com: python -c "from cryptography.fernet '
            'import Fernet; print(Fernet.generate_key().decode())"'
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_bytes(data: bytes) -> bytes:
    """Criptografa bytes (ex: conteúdo do .pfx). Retorna bytes cifrados."""
    return _fernet().encrypt(data)


def decrypt_bytes(token: bytes) -> bytes:
    """Descriptografa bytes. Lança InvalidToken se adulterado."""
    return _fernet().decrypt(token)


def encrypt_str(value: str) -> str:
    """Criptografa string (ex: senha do certificado). Retorna string base64."""
    return _fernet().encrypt(value.encode()).decode()


def decrypt_str(token: str) -> str:
    """Descriptografa string."""
    return _fernet().decrypt(token.encode()).decode()
