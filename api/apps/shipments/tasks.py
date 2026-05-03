import logging
from io import BytesIO

from celery import shared_task
from django.db.models import Sum
from django.utils import timezone
from openpyxl import Workbook

from apps.core.storage import R2Storage

from .models import Shipment
from .services import cancel_shipment, emit_shipment

logger = logging.getLogger(__name__)


def _digits(value):
    return ''.join(filter(str.isdigit, str(value or '')))


def _clean(value):
    return str(value or '').strip()


def _party_export_data(shipment, role: str):
    snapshot = getattr(shipment, f'{role}_snapshot') or {}
    person = getattr(shipment, role, None)
    address = getattr(shipment, f'{role}_address', None)

    if not address and person:
        address = (
            person.addresses
            .filter(is_active=True, is_default=True)
            .select_related('city')
            .first()
            or person.addresses.filter(is_active=True).select_related('city').first()
        )

    city_name = (
        _clean(snapshot.get('city_name'))
        or _clean(snapshot.get('city'))
        or (address.city.name if address and address.city else '')
    )
    city_uf = (
        _clean(snapshot.get('city_uf'))
        or _clean(snapshot.get('uf'))
        or (address.city.uf if address and address.city else '')
    )

    return {
        'name': _clean(snapshot.get('name')) or _clean(getattr(person, 'name', '')),
        'document': _digits(
            snapshot.get('document') or getattr(person, 'document', '')
        ),
        'address': _clean(snapshot.get('address'))
        or _clean(getattr(address, 'address', '')),
        'number': _clean(snapshot.get('number'))
        or _clean(getattr(address, 'number', '')),
        'complement': _clean(snapshot.get('complement'))
        or _clean(getattr(address, 'complement', '')),
        'neighborhood': _clean(snapshot.get('neighborhood'))
        or _clean(getattr(address, 'neighborhood', '')),
        'city': city_name,
        'uf': city_uf,
        'zip_code': _digits(
            snapshot.get('zip_code') or getattr(address, 'zip_code', '')
        ),
    }


def _carrier_export_data(shipment):
    snapshot = shipment.carrier_snapshot or {}
    carrier = shipment.carrier
    document = (
        snapshot.get('cnpj')
        or snapshot.get('document')
        or getattr(carrier, 'document', '')
    )
    return {
        'document': _digits(document),
        'name': _clean(snapshot.get('name')) or _clean(getattr(carrier, 'name', '')),
    }


@shared_task(bind=True, max_retries=3)
def emit_shipment_task(self, shipment_id):
    """
    Tarefa assíncrona para emitir um DCe.
    Retenta até 3 vezes com intervalo de 60 s em caso de falha transitória.
    """
    try:
        shipment = Shipment.objects.get(pk=shipment_id)
        emit_shipment(shipment)
        logger.info(f'Shipment {shipment_id} authorized successfully.')
    except Shipment.DoesNotExist:
        logger.error(f'Shipment {shipment_id} not found.')
    except Exception as e:
        logger.error(f'Error emitting shipment {shipment_id}: {e}')

        from apps.core.exceptions import ShipmentEmissionError  # noqa: PLC0415

        # Rejeição permanente (ex: SEFAZ recusou o XML) — não retentar
        if isinstance(e, ShipmentEmissionError) and getattr(e, 'permanent', False):
            return

        if self.request.retries < self.max_retries:
            # Ainda há tentativas — agenda retry sem reverter o status
            raise self.retry(exc=e, countdown=60) from e

        # Esgotou as tentativas transitórias — reverte para rascunho via FSM
        try:
            shipment = Shipment.objects.get(pk=shipment_id)
            if shipment.status == Shipment.Status.PROCESSING:
                shipment.revert_to_draft(error=str(e))
                shipment.save(
                    update_fields=['status', 'last_emission_error', 'updated_at']
                )
        except Shipment.DoesNotExist:
            pass


@shared_task(bind=True, max_retries=3)
def cancel_shipment_task(self, shipment_id, justificativa: str = ''):
    """
    Tarefa assíncrona para cancelar um DCe.
    Retenta até 3 vezes em falhas transitórias de comunicação com a SEFAZ.
    """
    try:
        shipment = Shipment.objects.get(pk=shipment_id)
        cancel_shipment(shipment, justificativa=justificativa or '')
        logger.info(f'Shipment {shipment_id} cancelled successfully.')
    except Shipment.DoesNotExist:
        logger.error(f'Shipment {shipment_id} not found.')
    except Exception as e:
        logger.error(f'Error cancelling shipment {shipment_id}: {e}')

        from apps.core.exceptions import (  # noqa: PLC0415
            SefazRejectError,
            ShipmentCancellationError,
        )

        # Erro permanente/regra de negócio: reverte para autorizado.
        if isinstance(e, (ShipmentCancellationError, SefazRejectError)):
            try:
                shipment = Shipment.objects.get(pk=shipment_id)
                if shipment.status == Shipment.Status.CANCELLING:
                    shipment.revert_cancel()
                    shipment.save(update_fields=['status', 'updated_at'])
            except Shipment.DoesNotExist:
                pass
            return

        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=60) from e


@shared_task(bind=True, max_retries=3)
def poll_distribution_task(self, company_id: str, tp_amb: int):
    """
    Consulta o serviço de distribuição DCe para uma empresa e ambiente.
    Continua paginando enquanto houver mais NSUs disponíveis.
    """
    from apps.companies.models import Company  # noqa: PLC0415

    from .dist_processor import process_distribution_batch  # noqa: PLC0415
    from .sefaz_client import SefazClient  # noqa: PLC0415

    try:
        company = Company.objects.get(pk=company_id)
    except Company.DoesNotExist:
        logger.error('Company %s not found for distribution poll.', company_id)
        return

    nsu_field = 'last_nsu_prod' if tp_amb == 1 else 'last_nsu_homolog'
    ult_nsu = getattr(company, nsu_field, '000000000000000')

    # Distribuição usa o primeiro emitente ativo com certificado da empresa.
    # O CNPJ do emitente é usado no payload da requisição SEFAZ.
    from apps.persons.models import Person  # noqa: PLC0415

    emitter = (
        Person.objects
        .filter(company=company, is_emitente=True, is_active=True)
        .select_related('certificate')
        .filter(certificate__cert_pfx__isnull=False)
        .first()
    )
    if not emitter:
        logger.warning(
            'Nenhum emitente com certificado encontrado para company=%s tp_amb=%d.',
            company_id,
            tp_amb,
        )
        return

    client = SefazClient(company, emitter)
    try:
        result = client.distribute_dce(ult_nsu, tp_amb)
    except Exception as e:
        logger.error(
            'Erro ao consultar distribuição (company=%s, tp_amb=%d): %s',
            company_id,
            tp_amb,
            e,
        )
        raise self.retry(exc=e, countdown=300) from e

    if result.procs:
        process_distribution_batch(company, result.procs)

    # Atualizar NSU mesmo sem novos documentos
    Company.objects.filter(pk=company.pk).update(**{nsu_field: result.ult_nsu})
    logger.info(
        'Distribuição company=%s tp_amb=%d: %d docs, ult_nsu=%s',
        company_id,
        tp_amb,
        len(result.procs),
        result.ult_nsu,
    )

    # Se ainda há mais páginas, enfileira próxima consulta imediatamente
    if result.has_more:
        poll_distribution_task.delay(company_id, tp_amb)


@shared_task
def dispatch_distribution_polling():
    """
    Task beat: polling para todas as empresas com certificado.
    """
    from apps.companies.models import Company  # noqa: PLC0415
    from apps.persons.models import Person  # noqa: PLC0415

    # Despacha polling para todas as empresas que têm pelo menos um emitente com cert
    company_ids = (
        Person.objects
        .filter(is_emitente=True, is_active=True, certificate__cert_pfx__isnull=False)
        .values_list('company_id', flat=True)
        .distinct()
    )
    companies = Company.objects.filter(id__in=company_ids).only('id', 'environment')

    for company in companies:
        poll_distribution_task.delay(str(company.id), company.environment)
    logger.info(
        'dispatch_distribution_polling: %d empresas enfileiradas.', companies.count()
    )


@shared_task(bind=True, max_retries=1)
def export_shipments_xlsx_task(
    _self, shipment_ids: list[str], requested_by_id: str, company_id: str | None = None
):
    """
    Gera o relatório XLSX de DCE em background e salva no R2.
    """
    qs_filter = {'id__in': shipment_ids}
    if company_id:
        qs_filter['company_id'] = company_id
    qs = (
        Shipment.objects
        .filter(**qs_filter)
        .select_related(
            'company',
            'sender',
            'recipient',
            'carrier',
            'sender_address',
            'sender_address__city',
            'recipient_address',
            'recipient_address__city',
            'carrier_address',
        )
        .prefetch_related('items')
        .annotate(total_value=Sum('items__v_prod'))
        .order_by('-created_at')
    )

    wb = Workbook()
    ws = wb.active
    ws.title = 'DCE'
    headers = [
        'Número DCE',
        'Data Emissão',
        'Status',
        'Remetente - Nome',
        'Remetente - Documento',
        'Remetente - Endereço',
        'Remetente - Número',
        'Remetente - Complemento',
        'Remetente - Bairro',
        'Remetente - Cidade',
        'Remetente - UF',
        'Remetente - CEP',
        'Destinatário - Nome',
        'Destinatário - Documento',
        'Destinatário - Endereço',
        'Destinatário - Número',
        'Destinatário - Complemento',
        'Destinatário - Bairro',
        'Destinatário - Cidade',
        'Destinatário - UF',
        'Destinatário - CEP',
        'Transportador - CNPJ',
        'Transportador - Nome',
        'Observação',
        'Valor Total (R$)',
    ]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = cell.font.copy(bold=True)

    for shipment in qs:
        sender = _party_export_data(shipment, 'sender')
        recipient = _party_export_data(shipment, 'recipient')
        carrier = _carrier_export_data(shipment)
        total_value = shipment.total_value or 0

        ws.append([
            shipment.number or '',
            (
                timezone.localtime(shipment.dh_emi).strftime('%d/%m/%Y %H:%M')
                if shipment.dh_emi
                else ''
            ),
            shipment.get_status_display(),
            sender['name'],
            sender['document'],
            sender['address'],
            sender['number'],
            sender['complement'],
            sender['neighborhood'],
            sender['city'],
            sender['uf'],
            sender['zip_code'],
            recipient['name'],
            recipient['document'],
            recipient['address'],
            recipient['number'],
            recipient['complement'],
            recipient['neighborhood'],
            recipient['city'],
            recipient['uf'],
            recipient['zip_code'],
            carrier['document'],
            carrier['name'],
            shipment.info_complementar or '',
            float(total_value),
        ])

    ws.freeze_panes = 'A2'

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    now = timezone.now()
    filename = f'dce_relatorio_{now.strftime("%Y%m%d_%H%M%S")}.xlsx'
    # Caminho do relatório no R2 por data/usuário
    rel_path = f'{now.strftime("%Y")}/{now.strftime("%m")}/{filename}'
    key = f'shipments/reports/{requested_by_id}/{rel_path}'
    storage = R2Storage()
    storage.upload_file(
        output.getvalue(),
        key,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )

    return {'owner_user_id': requested_by_id, 'key': key, 'filename': filename}
