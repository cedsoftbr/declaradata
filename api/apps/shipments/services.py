import logging
import traceback
from datetime import timedelta

from django.utils import timezone
from lxml import etree as _etree

from apps.core.exceptions import (
    SefazRejectError,
    ShipmentCancellationError,
    ShipmentEmissionError,
)
from apps.core.storage import R2Storage
from apps.persons.certificate import load_certificate as load_person_certificate
from apps.persons.models import Person, PersonAddress

from .models import Shipment
from .pdf_generator import generate_dce_pdf
from .sefaz_client import SefazClient
from .xml_builder import build_access_key, build_dce_xml, sign_dce_xml
from .xml_constants import DCE_NS
from .xml_validator import validate_inf_dce_access_key

logger = logging.getLogger('apps.shipments')

CNPJ_LENGTH = 14
MIN_CANCELLATION_REASON_LENGTH = 15
MAX_CANCELLATION_REASON_LENGTH = 255


def _build_person_snapshot(person, address: PersonAddress):
    """Constrói snapshot de Person com dados do momento da emissão."""
    doc_digits = ''.join(filter(str.isdigit, person.document or ''))
    is_cnpj = len(doc_digits) == CNPJ_LENGTH
    return {
        'name': person.name,
        'document': doc_digits,
        'document_type': 'cnpj' if is_cnpj else 'cpf',
        # Campos explícitos para manter compatibilidade com templates/XML que
        # fazem lookup direto em "cnpj"/"cpf".
        'cnpj': doc_digits if is_cnpj else '',
        'cpf': doc_digits if not is_cnpj else '',
        'address': address.address,
        'number': address.number,
        'complement': address.complement,
        'neighborhood': address.neighborhood,
        'zip_code': ''.join(filter(str.isdigit, address.zip_code or '')),
        'city_id': str(address.city.id),
        'city_name': address.city.name,
        'city_uf': address.city.uf,
        'city_ibge_code': address.city.ibge_code,
        'phone': ''.join(filter(str.isdigit, address.contact_phone or '')),
        'email': address.contact_email or '',
    }


def _build_carrier_snapshot(person):
    """Snapshot simplificado para transportador."""
    doc_digits = ''.join(filter(str.isdigit, person.document or ''))
    return {
        'name': person.name,
        'document': doc_digits,
        'cnpj': doc_digits,  # maintain cnpj for xml_builder
    }


def _build_emit_snapshot(emitter: Person, address: PersonAddress):
    """Snapshot da pessoa emitente com dados do endereço no momento da emissão."""
    doc_digits = ''.join(filter(str.isdigit, emitter.document or ''))
    city = address.city
    return {
        'name': emitter.name,
        'cnpj': doc_digits,
        'document': doc_digits,
        'document_type': 'cnpj' if len(doc_digits) == CNPJ_LENGTH else 'cpf',
        'address': address.address,
        'number': address.number,
        'complement': address.complement,
        'neighborhood': address.neighborhood,
        'zip_code': ''.join(filter(str.isdigit, address.zip_code or '')),
        'city_id': str(city.id) if city else '',
        'city_name': city.name if city else '',
        'city_uf': city.uf if city else '',
        'city_ibge_code': city.ibge_code if city else '',
        'phone': ''.join(filter(str.isdigit, address.contact_phone or '')),
    }


def _resolve_person_address(person: Person, selected_address: PersonAddress | None):
    if (
        selected_address
        and selected_address.person_id == person.id
        and selected_address.is_active
    ):
        return selected_address

    return (
        person.addresses
        .filter(is_active=True, is_default=True)
        .select_related('city')
        .first()
        or person.addresses
        .filter(is_active=True)
        .select_related('city')
        .order_by('-created_at')
        .first()
    )


def _get_shipment_storage_path(shipment, file_type, dt=None):
    """Gera o caminho dinâmico para o storage."""
    company = shipment.company
    company_id = ''.join(filter(str.isdigit, company.cnpj or '')) or str(company.id)

    dt = dt or shipment.dh_emi or timezone.now()
    year = dt.strftime('%Y')
    month = dt.strftime('%m')

    ext = 'pdf' if file_type == 'pdf' else 'xml'
    suffix = '-cancel' if file_type == 'canc' else ''
    filename = f'{shipment.access_key}{suffix}.{ext}'

    return f'shipments/{company_id}/{file_type}/{year}/{month}/{filename}'


def _save_shipment_files(shipment, xml_signed_bytes):
    """Gera PDF e faz upload de ambos (XML/PDF) para o R2."""
    try:
        storage = R2Storage()
        # 1. XML
        xml_key = _get_shipment_storage_path(shipment, 'xml')
        storage.upload_file(xml_signed_bytes, xml_key, 'application/xml')
        shipment.xml_key = xml_key

        # 2. PDF
        pdf_content = generate_dce_pdf(shipment)
        pdf_key = _get_shipment_storage_path(shipment, 'pdf')
        storage.upload_file(pdf_content, pdf_key, 'application/pdf')
        shipment.pdf_key = pdf_key
    except Exception as e:
        logger.error(f'Erro ao salvar arquivos no R2: {e}')
        raise ShipmentEmissionError(f'Falha ao salvar arquivos no storage: {e}') from e


def _save_cancelled_pdf(shipment):
    """Substitui o PDF existente pela versão com marca d'água CANCELADO."""
    try:
        storage = R2Storage()
        pdf_content = generate_dce_pdf(shipment)
        pdf_key = _get_shipment_storage_path(shipment, 'pdf')
        storage.upload_file(pdf_content, pdf_key, 'application/pdf')
        if not shipment.pdf_key:
            shipment.pdf_key = pdf_key
            shipment.save(update_fields=['pdf_key'])
    except Exception as e:
        logger.error(f'Erro ao gerar PDF cancelado para DCe {shipment.pk}: {e}')


def _save_cancel_file(shipment, cancel_xml_bytes, dt=None):
    """Faz upload do XML de cancelamento para o R2."""
    try:
        storage = R2Storage()
        cancel_key = _get_shipment_storage_path(shipment, 'canc', dt=dt)
        storage.upload_file(cancel_xml_bytes, cancel_key, 'application/xml')
        shipment.cancel_xml_key = cancel_key
    except Exception as e:
        logger.error(f'Erro ao salvar XML de cancelamento no R2: {e}')
        raise ShipmentCancellationError(
            f'Falha ao salvar XML de cancelamento no storage: {e}'
        ) from e


def collect_participants_snapshot(shipment, *, strict: bool = False):  # noqa: PLR0912
    snapshots = {}

    if shipment.sender_id:
        sender = Person.objects.select_related('company').get(pk=shipment.sender_id)
        sender_address = _resolve_person_address(sender, shipment.sender_address)
        if not sender_address:
            if strict:
                raise ShipmentEmissionError(
                    'Remetente sem endereço ativo para emissão.'
                )
        else:
            snapshots['sender'] = _build_person_snapshot(sender, sender_address)
    elif strict:
        raise ShipmentEmissionError(
            'Remetente é obrigatório para emissão e composição do emitente da DC-e.'
        )

    if not shipment.recipient_id:
        if strict:
            raise ShipmentEmissionError('Destinatário é obrigatório para emissão.')
    else:
        recipient = Person.objects.select_related('company').get(
            pk=shipment.recipient_id
        )
        recipient_address = _resolve_person_address(
            recipient, shipment.recipient_address
        )
        if not recipient_address:
            if strict:
                raise ShipmentEmissionError(
                    'Destinatário sem endereço ativo para emissão.'
                )
        else:
            snapshots['recipient'] = _build_person_snapshot(
                recipient, recipient_address
            )

    if shipment.carrier_id:
        carrier = Person.objects.select_related('company').get(pk=shipment.carrier_id)
        snapshots['carrier'] = _build_carrier_snapshot(carrier)

    # Regra fiscal interna: o bloco <emit> sempre deve refletir o remetente.
    sender_snap = snapshots.get('sender')
    if not sender_snap:
        if strict:
            raise ShipmentEmissionError(
                'Remetente sem dados válidos para compor o emitente da DC-e.'
            )
    else:
        snapshots['emit'] = sender_snap

    if not shipment.emitter_id:
        if strict:
            raise ShipmentEmissionError('Emitente é obrigatório para emissão.')
    else:
        emitter = Person.objects.prefetch_related('addresses__city').get(
            pk=shipment.emitter_id
        )
        emitter_address = _resolve_person_address(emitter, None)
        if not emitter_address:
            if strict:
                raise ShipmentEmissionError('Emitente sem endereço ativo para emissão.')
        else:
            # Snapshot do ator emitente fiscal (marketplace/transportadora/etc),
            # sem sobrescrever o bloco <emit>, que sempre vem do remetente.
            snapshots['emitter'] = _build_emit_snapshot(emitter, emitter_address)
    return snapshots


def _collect_snapshots(shipment):
    # Em emissão, snapshot é obrigatório e bloqueia se dados críticos faltarem.
    return collect_participants_snapshot(shipment, strict=True)


def _extract_inf_dce_supl(xml_signed: bytes) -> tuple[str, str]:
    try:
        root = _etree.fromstring(xml_signed)
    except Exception:
        return '', ''

    qr = root.findtext(f'.//{{{DCE_NS}}}infDCeSupl/{{{DCE_NS}}}qrCodDCe') or ''
    url_chave = root.findtext(f'.//{{{DCE_NS}}}infDCeSupl/{{{DCE_NS}}}urlChave') or ''
    return qr, url_chave


def emit_shipment(shipment):
    """
    Realiza o fluxo completo de emissão da remessa (DCe).
    """
    if shipment.status not in {Shipment.Status.DRAFT, Shipment.Status.PROCESSING}:
        raise ShipmentEmissionError('Apenas remessas em rascunho podem ser emitidas.')

    try:
        shipment.participants_snapshot = _collect_snapshots(shipment)
        if not shipment.dh_emi:
            shipment.dh_emi = timezone.now()

        if (
            shipment.tp_emit == Shipment.EmitType.TRANSPORTADORA
            and not shipment.carrier_id
        ):
            raise ShipmentEmissionError(
                'Transportador é obrigatório quando o tipo de emitente for '
                'Transportadora.'
            )

        Shipment.assign_number(shipment)
        build_access_key(shipment)
        xml_bytes = build_dce_xml(shipment)
        try:
            validate_inf_dce_access_key(xml_bytes, shipment.access_key)
        except ValueError as e:
            raise ShipmentEmissionError(
                f'Falha na validação local da chave de acesso: {e}',
                permanent=True,
            ) from e
        logger.info('XML antes da assinatura: %s', xml_bytes.decode('utf-8'))
        xml_signed = _sign_or_wrap_xml(shipment, xml_bytes)
        shipment.qr_code_url, shipment.url_chave = _extract_inf_dce_supl(xml_signed)

        _handle_sefaz_or_simulate(shipment, xml_signed)

        shipment.authorize()
        shipment.save()
        return shipment
    except Exception as e:
        if isinstance(e, ShipmentEmissionError):
            raise
        msg = f'Erro na emissão: {e}\n{traceback.format_exc()}'
        raise ShipmentEmissionError(msg) from e


def _sign_or_wrap_xml(shipment, xml_bytes):
    emitter = shipment.emitter
    emitter_has_cert = (
        emitter is not None
        and hasattr(emitter, 'certificate')
        and bool(emitter.certificate and emitter.certificate.cert_pfx)
    )

    if emitter_has_cert:
        private_key, cert, _extra = load_person_certificate(emitter)
        return sign_dce_xml(xml_bytes, private_key, cert)

    if shipment.tp_amb in {Shipment.Ambient.PRODUCAO, Shipment.Ambient.HOMOLOGACAO}:
        raise ShipmentEmissionError(
            'O emitente não possui certificado digital cadastrado.'
        )

    root = _etree.fromstring(xml_bytes)
    wrapper = _etree.Element(f'{{{DCE_NS}}}DCe', nsmap={None: DCE_NS})
    wrapper.append(root)
    return _etree.tostring(wrapper, encoding='unicode').encode('utf-8')


def _handle_sefaz_or_simulate(shipment, xml_signed_bytes):
    company = shipment.company
    emitter = shipment.emitter
    emitter_has_cert = (
        emitter is not None
        and hasattr(emitter, 'certificate')
        and bool(emitter.certificate and emitter.certificate.cert_pfx)
    )
    emitter_environment = emitter.certificate.environment if emitter_has_cert else None
    is_real = (
        shipment.tp_amb in {Shipment.Ambient.PRODUCAO, Shipment.Ambient.HOMOLOGACAO}
        and emitter_environment == shipment.tp_amb
        and emitter_has_cert
    )
    if is_real:
        try:
            client = SefazClient(company, emitter)
            n_prot, dh_recbto = client.authorize_dce(shipment, xml_signed_bytes)
            shipment.n_prot = n_prot
            shipment.dh_recbto = dh_recbto
            shipment.protocol = n_prot
            _save_shipment_files(shipment, xml_signed_bytes)
        except SefazRejectError as e:
            shipment.reject(error=str(e))
            shipment.save(update_fields=['status', 'last_emission_error', 'updated_at'])
            raise ShipmentEmissionError(str(e), permanent=True) from e
    else:
        shipment.protocol = 'SIMULADO'
        _save_shipment_files(shipment, xml_signed_bytes)


def cancel_shipment(shipment, justificativa: str = ''):
    """
    Cancela uma remessa autorizada.
    """
    if shipment.status not in {Shipment.Status.AUTHORIZED, Shipment.Status.CANCELLING}:
        raise ShipmentCancellationError(
            'Apenas remessas autorizadas podem ser canceladas.'
        )

    company = shipment.company
    emitter = shipment.emitter
    just = SefazClient._normalize_justificativa(justificativa)

    emitter_has_cert = (
        emitter is not None
        and hasattr(emitter, 'certificate')
        and bool(emitter.certificate and emitter.certificate.cert_pfx)
    )

    is_real_sefaz = shipment.tp_amb in {
        Shipment.Ambient.PRODUCAO,
        Shipment.Ambient.HOMOLOGACAO,
    }

    if is_real_sefaz and (not emitter_has_cert or not shipment.n_prot):
        raise ShipmentCancellationError(
            'No ambiente de homologação/produção o cancelamento '
            'deve ser realizado na SEFAZ.'
        )

    if is_real_sefaz and emitter_has_cert and shipment.n_prot:
        if not just or len(just) < MIN_CANCELLATION_REASON_LENGTH:
            msg = (
                f'Justificativa deve ter pelo menos '
                f'{MIN_CANCELLATION_REASON_LENGTH} caracteres.'
            )
            raise ShipmentCancellationError(msg)
        if len(just) > MAX_CANCELLATION_REASON_LENGTH:
            msg = (
                f'Justificativa deve ter no máximo '
                f'{MAX_CANCELLATION_REASON_LENGTH} caracteres.'
            )
            raise ShipmentCancellationError(msg)
        if shipment.dh_recbto and timezone.now() - shipment.dh_recbto > timedelta(
            hours=24
        ):
            raise ShipmentCancellationError(
                'Prazo de cancelamento expirado (máximo 24 horas após autorização).'
            )
        client = SefazClient(company, emitter)
        n_prot_cancel, dh_cancel, cancel_xml_bytes = client.cancel_dce(shipment, just)
        shipment.n_prot_cancel = n_prot_cancel
        shipment.dh_cancel = dh_cancel
        _save_cancel_file(shipment, cancel_xml_bytes, dt=dh_cancel)

    if shipment.status == Shipment.Status.AUTHORIZED:
        shipment.start_cancel()

    shipment.cancel()
    shipment.save(
        update_fields=[
            'status',
            'n_prot_cancel',
            'dh_cancel',
            'cancel_xml_key',
            'updated_at',
        ]
    )
    _save_cancelled_pdf(shipment)
    return shipment
