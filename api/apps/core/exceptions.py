class BusinessError(Exception):
    """Base exception for all business logic errors."""


class CertificateError(BusinessError):
    """Errors related to digital certificates."""


class ShipmentEmissionError(BusinessError):
    """Errors during shipment (DCe) emission process."""

    def __init__(self, message: str, permanent: bool = False):
        super().__init__(message)
        self.permanent = permanent  # True = rejeição SEFAZ, não deve retentar


class ShipmentCancellationError(BusinessError):
    """Errors during shipment cancellation."""


class SefazError(Exception):
    """Erro retornado pelo webservice SEFAZ."""

    def __init__(self, c_stat: str, x_motivo: str):
        self.c_stat = c_stat
        self.x_motivo = x_motivo
        super().__init__(f'SEFAZ [{c_stat}]: {x_motivo}')


class SefazRejectError(SefazError):
    """Rejeição permanente pela SEFAZ — não deve ser retentada."""


class SefazTransientError(SefazError):
    """Indisponibilidade transitória da SEFAZ — pode ser retentada pelo Celery."""
