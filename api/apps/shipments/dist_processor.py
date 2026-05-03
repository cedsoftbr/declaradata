"""
Processador de lotes de distribuição retornados pela SEFAZ-PR (serviço distDCe).

Reconcilia os ProcItem recebidos com os Shipments locais:
  - DCe autorizado → atualiza n_prot / dh_recbto se ainda em branco
  - Evento de cancelamento (tpEvento=110111) → atualiza status + protocolo
"""

import logging

from .models import Shipment
from .sefaz_client import ProcItem

logger = logging.getLogger(__name__)


def process_distribution_batch(company, procs: list[ProcItem]) -> None:
    """Processa uma lista de ProcItem retornada pelo serviço de distribuição."""
    for proc in procs:
        try:
            if proc.tipo == 'DCe':
                _handle_dce(company, proc)
            elif proc.tipo == 'evento' and proc.tp_evento == '110111':
                _handle_cancelamento(company, proc)
        except Exception:
            logger.exception(
                'Erro ao processar proc NSU=%s chDCe=%s', proc.nsu_svd, proc.ch_dce
            )


def _handle_dce(company, proc: ProcItem) -> None:
    """Atualiza protocolo de autorização se o Shipment ainda não tiver."""
    updated = Shipment.objects.filter(
        company=company,
        access_key=proc.ch_dce,
        n_prot='',
    ).update(n_prot=proc.n_prot, dh_recbto=proc.dh_recbto)

    if updated:
        logger.info(
            'DCe %s: protocolo %s registrado via distribuição.',
            proc.ch_dce,
            proc.n_prot,
        )


def _handle_cancelamento(company, proc: ProcItem) -> None:
    """Marca o Shipment como cancelado com base em evento recebido via distribuição."""
    updated = Shipment.objects.filter(
        company=company,
        access_key=proc.ch_dce,
        status=Shipment.Status.AUTHORIZED,
    ).update(
        status=Shipment.Status.CANCELLED,
        n_prot_cancel=proc.n_prot,
        dh_cancel=proc.dh_recbto,
    )

    if updated:
        logger.info('DCe %s: cancelamento via distribuição registrado.', proc.ch_dce)
