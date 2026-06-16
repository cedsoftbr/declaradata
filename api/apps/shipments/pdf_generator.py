import base64
import io
import logging
import os
from urllib.parse import urlencode

import barcode
import qrcode
from barcode.writer import ImageWriter
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from django.conf import settings
from django.template.loader import render_to_string
from django.utils import timezone
from weasyprint import HTML

from .models import Shipment

logger = logging.getLogger(__name__)

# Constants for magic numbers
TP_EMIS_CONTINGENCY = 9
CNPJ_LENGTH = 14
CPF_LENGTH = 11


def _safe_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _transport_mode_display(shipment) -> str:
    # Prefer model display helper when available.
    display_fn = getattr(shipment, 'get_transport_mode_display', None)
    if callable(display_fn):
        try:
            mode_val = _safe_int(getattr(shipment, 'transport_mode', 1), 1)
            return f'{mode_val} - {display_fn()}'
        except Exception:
            pass

    labels = {
        Shipment.TransportMode.RODOVIARIO: 'Rodoviário',
        Shipment.TransportMode.AEREO: 'Aéreo',
        Shipment.TransportMode.AQUAVIARIO: 'Aquaviário',
        Shipment.TransportMode.FERROVIARIO: 'Ferroviário',
        Shipment.TransportMode.POSTAL: 'Postal',
    }
    mode = _safe_int(getattr(shipment, 'transport_mode', 1), 1)
    return f'{mode} - {labels.get(mode, "Não informado")}'


def _contingency_signature(access_key: str, shipment, shipment_pk):
    emitter = getattr(shipment, 'emitter', None)
    if emitter is None:
        return None

    try:
        # Import local to avoid heavy/circular load when not needed.
        from apps.persons.certificate import load_certificate  # noqa: PLC0415

        private_key, _cert, _extra = load_certificate(emitter)
        signature = private_key.sign(
            access_key.encode('utf-8'),
            padding.PKCS1v15(),
            hashes.SHA1(),
        )
        return base64.b64encode(signature).decode('utf-8')
    except Exception as e:
        logger.warning(
            'Falha ao gerar assinatura do QR contingência para DCe %s: %s',
            shipment_pk,
            e,
        )
        return None


def _build_qr_payload(shipment, raw_access_key: str, shipment_pk):
    existing_qr_url = getattr(shipment, 'qr_code_url', '')
    if existing_qr_url:
        return existing_qr_url

    base_qr = getattr(
        settings, 'SEFAZ_QR_CODE_URL', 'https://www.fazenda.pr.gov.br/dce/qrcode'
    )
    tp_amb = _safe_int(getattr(shipment, 'tp_amb', Shipment.Ambient.HOMOLOGACAO), 2)
    tp_emis = _safe_int(getattr(shipment, 'tp_emis', 1), 1)

    params = {
        'chDCe': raw_access_key,
        'tpAmb': str(tp_amb),
    }

    # Contingência offline (tpEmis=9): exige identificação do emitente + assinatura.
    if tp_emis == TP_EMIS_CONTINGENCY:
        emit_snapshot = getattr(shipment, 'emit_snapshot', None) or {}
        doc = (
            (emit_snapshot.get('cnpj') or '') or (emit_snapshot.get('document') or '')
        ).strip()

        if len(doc) == CNPJ_LENGTH:
            params['CNPJ'] = doc
        elif len(doc) == CPF_LENGTH:
            params['CPF'] = doc
        elif doc:
            params['idOutros'] = doc

        sign = _contingency_signature(raw_access_key, shipment, shipment_pk)
        if sign:
            params['sign'] = sign

    return f'{base_qr}?{urlencode(params)}'


def _generate_barcode(key, shipment_pk):
    """Helper para gerar código de barras base64."""
    try:
        raw_key = key.replace('DCe', '')
        cod128_class = barcode.get_barcode_class('code128')
        rv = io.BytesIO()
        cod128_class(raw_key, writer=ImageWriter()).write(
            rv,
            options={
                'write_text': False,
                'module_height': 12.0,
                # Especificação DACE: módulo mínimo ~0,02cm
                # e zona silenciosa >=10 módulos.
                'module_width': 0.21,
                'quiet_zone': 2.1,
            },
        )
        return base64.b64encode(rv.getvalue()).decode('utf-8')
    except Exception as e:
        logger.warning(
            'Falha ao gerar código de barras para DCe %s: %s', shipment_pk, e
        )
        return None


def _generate_qrcode(data, shipment_pk):
    """Helper para gerar QR code base64."""
    try:
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=4,
            border=2,
        )
        qr.add_data(data)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color='black', back_color='white')
        qr_buf = io.BytesIO()
        qr_img.save(qr_buf)
        return base64.b64encode(qr_buf.getvalue()).decode('utf-8')
    except Exception as e:
        logger.warning('Falha ao gerar QR Code para DCe %s: %s', shipment_pk, e)
        return None


def generate_dce_pdf(shipment):  # noqa: PLR0914
    """
    Gera o PDF do DCe a partir do objeto shipment.
    """
    barcode_b64 = None
    qr_b64 = None
    access_key_fmt = '- - -'
    sender_or_emit_snapshot = getattr(shipment, 'sender_snapshot', None) or getattr(
        shipment, 'emit_snapshot', None
    )
    emitente_snapshot = getattr(shipment, 'emit_snapshot', None)
    marketplace_snapshot = getattr(shipment, 'marketplace_snapshot', None)
    carrier_snapshot = getattr(shipment, 'carrier_snapshot', None)

    tp_emit = _safe_int(getattr(shipment, 'tp_emit', Shipment.EmitType.PROPRIO), 2)
    if tp_emit == Shipment.EmitType.MARKETPLACE:
        fiscal_snapshot = marketplace_snapshot or emitente_snapshot
        fiscal_label = 'Marketplace'
    elif tp_emit == Shipment.EmitType.TRANSPORTADORA:
        fiscal_snapshot = carrier_snapshot or emitente_snapshot
        fiscal_label = 'Transportadora'
    else:
        fiscal_snapshot = emitente_snapshot
        fiscal_label = 'Emitente'
    tp_amb = _safe_int(getattr(shipment, 'tp_amb', 3), 3)
    tp_emis = _safe_int(getattr(shipment, 'tp_emis', 1), 1)
    is_contingency = tp_emis == TP_EMIS_CONTINGENCY

    if shipment.access_key:
        barcode_b64 = _generate_barcode(shipment.access_key, shipment.pk)
        raw_key = shipment.access_key.replace('DCe', '')
        qr_payload = _build_qr_payload(shipment, raw_key, shipment.pk)
        qr_b64 = _generate_qrcode(qr_payload, shipment.pk)
        access_key_fmt = ' '.join(raw_key[i : i + 4] for i in range(0, len(raw_key), 4))

    topo_path = os.path.join(settings.BASE_DIR, 'topo.png')
    if not os.path.exists(topo_path):
        topo_path = None

    protocol_dt = shipment.dh_recbto or shipment.dh_emi or timezone.now()
    protocol_dt_display = timezone.localtime(protocol_dt).strftime('%d/%m/%Y %H:%M:%S')
    protocol_number = getattr(shipment, 'protocol', '') or 'NÃO PROTOCOLADO'
    if is_contingency:
        protocol_number = f'{protocol_number} (EMITIDA EM CONTINGÊNCIA)'

    context = {
        'shipment': shipment,
        'total_value': sum(item.v_prod for item in shipment.items.all()),
        'qr_base64': qr_b64,
        'barcode_base64': barcode_b64,
        'topo_path': topo_path,
        'access_key_formatted': access_key_fmt,
        'sender_or_emit_snapshot': sender_or_emit_snapshot,
        'emitente_snapshot': emitente_snapshot,
        'fiscal_snapshot': fiscal_snapshot,
        'fiscal_label': fiscal_label,
        'is_contingency': is_contingency,
        'transport_mode_display': _transport_mode_display(shipment),
        'protocol_number_display': protocol_number,
        'watermark_text': (
            'CANCELADO'
            if getattr(shipment, 'status', None) == Shipment.Status.CANCELLED
            else 'EMITIDA EM HOMOLOGAÇÃO'
            if tp_amb == Shipment.Ambient.HOMOLOGACAO
            else 'SIMULADO'
            if tp_amb == Shipment.Ambient.SIMULADO
            else ''
        ),
        'protocol_datetime_display': protocol_dt_display,
    }

    html_string = render_to_string('shipments/dce_pdf.html', context)
    pdf_file = io.BytesIO()
    HTML(string=html_string, base_url=str(settings.BASE_DIR)).write_pdf(target=pdf_file)
    pdf_file.seek(0)
    return pdf_file.read()
