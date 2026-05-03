"""
Construção e assinatura XML do DC-e v1.00.
"""

import base64
from datetime import timedelta, timezone
from urllib.parse import urlencode

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from django.conf import settings
from lxml import etree
from signxml import SignatureConstructionMethod, XMLSigner
from signxml.algorithms import CanonicalizationMethod, DigestAlgorithm, SignatureMethod
from signxml.util import namespaces as _signxml_ns

from .xml_constants import DCE_NS

MAX_WEIGHT = 9
CNPJ_LENGTH = 14
ACCESS_KEY_PRE_DV_LEN = 43
BRT_TZ = timezone(timedelta(hours=-3))


def _dce(tag: str) -> str:
    return f'{{{DCE_NS}}}{tag}'


class _SefazXMLSigner(XMLSigner):
    """Signer para SEFAZ-PR: SHA1 obrigatório + Signature sem prefixo."""

    def check_deprecated_methods(self) -> None:
        pass


def _make_signer() -> _SefazXMLSigner:
    signer = _SefazXMLSigner(
        method=SignatureConstructionMethod.enveloped,
        signature_algorithm=SignatureMethod.RSA_SHA1,
        digest_algorithm=DigestAlgorithm.SHA1,
        c14n_algorithm=CanonicalizationMethod.CANONICAL_XML_1_0,
    )
    signer.namespaces = {None: _signxml_ns.ds}
    return signer


# ── Chave de acesso ────────────────────────────────────────────────────────────


CDC_LENGTH = 6


def _resolve_access_key_cnpj(shipment) -> str:
    participants = (
        shipment.participants_snapshot
        if isinstance(shipment.participants_snapshot, dict)
        else {}
    )
    emitter_actor = participants.get('emitter') or {}
    emit_snapshot = (
        shipment.emit_snapshot if isinstance(shipment.emit_snapshot, dict) else {}
    )
    tp_emit = int(getattr(shipment, 'tp_emit', 2) or 2)

    # Alinhado com xml_validator / leiaute:
    # - tpEmit=1 (Marketplace): bloco Marketplace
    # - tpEmit=2 (Emissor próprio): bloco emit
    # - tpEmit=3 (Transportadora): bloco Transportadora
    if tp_emit in {1, 3}:
        actor_doc = emitter_actor.get('cnpj') or emitter_actor.get('document') or ''
        if actor_doc:
            return ''.join(filter(str.isdigit, actor_doc)).zfill(CNPJ_LENGTH)[
                :CNPJ_LENGTH
            ]

    emit_doc = emit_snapshot.get('cnpj') or emit_snapshot.get('document') or ''
    return ''.join(filter(str.isdigit, emit_doc)).zfill(CNPJ_LENGTH)[:CNPJ_LENGTH]


def _resolve_c_uf(shipment) -> str:
    participants = (
        shipment.participants_snapshot
        if isinstance(shipment.participants_snapshot, dict)
        else {}
    )
    emitter_actor = participants.get('emitter') or {}
    ibge = emitter_actor.get('city_ibge_code') or ''
    if ibge:
        return ibge[:2]
    return (shipment.emit_snapshot or {}).get('city_ibge_code', '')[:2]


def build_access_key(shipment) -> None:
    c_uf = _resolve_c_uf(shipment)
    aa_mm = _to_brt_datetime(shipment.dh_emi).strftime('%y%m')
    cnpj = _resolve_access_key_cnpj(shipment)
    mod = '99'
    serie = f'{int(shipment.serie or 1):03d}'
    number = f'{int(shipment.number or 0):09d}'
    tp_emis = str(shipment.tp_emis or 1)
    tp_emit = str(shipment.tp_emit)
    n_site = '0'
    c_dc = (shipment.c_dc or '').zfill(CDC_LENGTH)[:CDC_LENGTH]

    pre_key = f'{c_uf}{aa_mm}{cnpj}{mod}{serie}{number}{tp_emis}{tp_emit}{n_site}{c_dc}'
    weights = ([2, 3, 4, 5, 6, 7, 8, 9] * 6)[:ACCESS_KEY_PRE_DV_LEN]
    weights.reverse()
    total = sum(int(d) * w for d, w in zip(pre_key, weights, strict=True))
    rem = total % 11
    dv = 0 if rem in {0, 1} else 11 - rem
    shipment.access_key = f'{pre_key}{dv}'
    shipment.c_dv = dv


# ── Construção do infDCe ───────────────────────────────────────────────────────


def build_dce_xml(shipment) -> bytes:
    root = etree.Element(_dce('infDCe'), versao='1.00', nsmap={None: DCE_NS})
    root.set('Id', f'DCe{shipment.access_key}')

    _add_ide(root, shipment)
    _add_emit(root, shipment)
    _add_participants(root, shipment)
    _add_items(root, shipment)
    _add_total(root, shipment)
    _add_transp(root, shipment)
    _add_inf_dec(root, shipment)

    return etree.tostring(root, encoding='unicode').encode('utf-8')


def _add_ide(root, shipment):
    ide = etree.SubElement(root, _dce('ide'))
    etree.SubElement(ide, _dce('cUF')).text = _resolve_c_uf(shipment)
    c_dc_val = (shipment.c_dc or '').zfill(CDC_LENGTH)[:CDC_LENGTH]
    etree.SubElement(ide, _dce('cDC')).text = c_dc_val
    etree.SubElement(ide, _dce('mod')).text = '99'
    etree.SubElement(ide, _dce('serie')).text = str(int(shipment.serie or 1))
    etree.SubElement(ide, _dce('nDC')).text = str(int(shipment.number or 0))

    dh_brt = _to_brt_datetime(shipment.dh_emi)
    etree.SubElement(ide, _dce('dhEmi')).text = dh_brt.strftime(
        '%Y-%m-%dT%H:%M:%S-03:00'
    )
    etree.SubElement(ide, _dce('tpEmis')).text = str(shipment.tp_emis or 1)
    etree.SubElement(ide, _dce('tpEmit')).text = str(shipment.tp_emit)
    etree.SubElement(ide, _dce('nSiteAutoriz')).text = '0'
    etree.SubElement(ide, _dce('cDV')).text = str(shipment.c_dv or 0)
    etree.SubElement(ide, _dce('tpAmb')).text = str(shipment.tp_amb)
    etree.SubElement(ide, _dce('verProc')).text = '1.0'


def _to_brt_datetime(dt):
    return dt.astimezone(BRT_TZ)


def _add_emit(root, shipment):
    emit_snap = shipment.emit_snapshot
    emit = etree.SubElement(root, _dce('emit'))
    doc_type = emit_snap.get('document_type')
    if doc_type == 'cpf' and emit_snap.get('cpf'):
        etree.SubElement(emit, _dce('CPF')).text = emit_snap['cpf']
    else:
        cnpj = emit_snap.get('cnpj') or emit_snap.get('document', '')
        etree.SubElement(emit, _dce('CNPJ')).text = cnpj
    etree.SubElement(emit, _dce('xNome')).text = emit_snap['name']
    ender = etree.SubElement(emit, _dce('enderEmit'))
    etree.SubElement(ender, _dce('xLgr')).text = emit_snap['address']
    etree.SubElement(ender, _dce('nro')).text = emit_snap['number'] or 'S/N'
    if emit_snap.get('complement'):
        etree.SubElement(ender, _dce('xCpl')).text = emit_snap['complement']
    etree.SubElement(ender, _dce('xBairro')).text = emit_snap['neighborhood']
    etree.SubElement(ender, _dce('cMun')).text = emit_snap['city_ibge_code']
    etree.SubElement(ender, _dce('xMun')).text = emit_snap['city_name']
    etree.SubElement(ender, _dce('UF')).text = emit_snap['city_uf']
    etree.SubElement(ender, _dce('CEP')).text = emit_snap['zip_code']
    etree.SubElement(ender, _dce('cPais')).text = '1058'
    etree.SubElement(ender, _dce('xPais')).text = 'Brasil'


def _add_participants(root, shipment):
    emitter_actor = (shipment.participants_snapshot or {}).get('emitter') or {}
    actor_doc = emitter_actor.get('cnpj') or emitter_actor.get('document', '')
    actor_name = emitter_actor.get('name', '')

    # tags de identificação por tipo de emitente no mesmo bloco do leiaute
    if shipment.tp_emit == 1 and emitter_actor:  # Marketplace
        mk = etree.SubElement(root, _dce('Marketplace'))
        etree.SubElement(mk, _dce('CNPJ')).text = actor_doc
        etree.SubElement(mk, _dce('xNome')).text = actor_name
        site = (
            emitter_actor.get('site')
            or getattr(getattr(shipment, 'company', None), 'trade_name', '')
            or 'SEM_SITE'
        )
        etree.SubElement(mk, _dce('Site')).text = site
    elif shipment.tp_emit == 2 and emitter_actor:  # noqa: PLR2004 — Emissor Próprio
        # No leiaute aceito pela SEFAZ, tpEmit=2 não possui bloco específico
        # entre <emit> e <dest>; os dados já estão em <emit>.
        pass
    elif shipment.tp_emit == 3 and emitter_actor:  # noqa: PLR2004 — Transportadora
        transp_tag = etree.SubElement(root, _dce('Transportadora'))
        etree.SubElement(transp_tag, _dce('CNPJ')).text = actor_doc
        etree.SubElement(transp_tag, _dce('xNome')).text = actor_name
    # tp_emit fora do mapeamento acima não gera bloco adicional aqui.

    dest_snap = shipment.recipient_snapshot
    dest = etree.SubElement(root, _dce('dest'))
    tag_doc = 'CNPJ' if dest_snap['document_type'] == 'cnpj' else 'CPF'
    etree.SubElement(dest, _dce(tag_doc)).text = dest_snap['document']
    dest_nome = (
        'DCE EMITIDA EM AMBIENTE DE HOMOLOGACAO'
        if str(shipment.tp_amb) == '2'
        else dest_snap['name']
    )
    etree.SubElement(dest, _dce('xNome')).text = dest_nome
    ender_d = etree.SubElement(dest, _dce('enderDest'))
    etree.SubElement(ender_d, _dce('xLgr')).text = dest_snap['address']
    etree.SubElement(ender_d, _dce('nro')).text = dest_snap['number'] or 'S/N'
    etree.SubElement(ender_d, _dce('xBairro')).text = dest_snap['neighborhood']
    etree.SubElement(ender_d, _dce('cMun')).text = dest_snap['city_ibge_code']
    etree.SubElement(ender_d, _dce('xMun')).text = dest_snap['city_name']
    etree.SubElement(ender_d, _dce('UF')).text = dest_snap['city_uf']
    etree.SubElement(ender_d, _dce('CEP')).text = dest_snap['zip_code']
    etree.SubElement(ender_d, _dce('cPais')).text = '1058'
    etree.SubElement(ender_d, _dce('xPais')).text = 'Brasil'
    if dest_snap.get('phone'):
        etree.SubElement(ender_d, _dce('fone')).text = dest_snap['phone']
    if dest_snap.get('email'):
        etree.SubElement(ender_d, _dce('email')).text = dest_snap['email']


def _add_items(root, shipment):
    for item in shipment.items.all():
        det = etree.SubElement(root, _dce('det'))
        det.set('nItem', str(item.n_item))
        prod = etree.SubElement(det, _dce('prod'))
        etree.SubElement(prod, _dce('xProd')).text = item.x_prod
        etree.SubElement(prod, _dce('NCM')).text = item.ncm
        etree.SubElement(prod, _dce('qCom')).text = f'{item.q_com:.4f}'
        etree.SubElement(prod, _dce('vUnCom')).text = f'{item.v_un_com:.8f}'
        etree.SubElement(prod, _dce('vProd')).text = f'{item.v_prod:.8f}'


def _add_total(root, shipment):
    total = etree.SubElement(root, _dce('total'))
    v_prod = sum(item.v_prod for item in shipment.items.all())
    etree.SubElement(total, _dce('vDC')).text = f'{v_prod:.2f}'


def _add_transp(root, shipment):
    transp = etree.SubElement(root, _dce('transp'))
    etree.SubElement(transp, _dce('modTrans')).text = str(shipment.tp_transp)
    if shipment.tp_transp == 2 and shipment.carrier_snapshot:  # noqa: PLR2004
        doc = shipment.carrier_snapshot.get('cnpj') or shipment.carrier_snapshot.get(
            'document', ''
        )
        etree.SubElement(transp, _dce('CNPJTransp')).text = doc


def _add_inf_dec(root, shipment):
    inf_dec = etree.SubElement(root, _dce('infDec'))
    cpl_msg = (
        'É contribuinte de ICMS qualquer pessoa física ou jurídica que '
        'realize operações de circulação de mercadorias.'
    )
    inf_cpl = shipment.info_complementar or cpl_msg
    etree.SubElement(inf_dec, _dce('xObs1')).text = inf_cpl
    fisco_msg = 'Constitui crime contra a ordem tributária suprimir ou reduzir tributo.'
    etree.SubElement(inf_dec, _dce('xObs2')).text = shipment.info_fisco or fisco_msg


# ── Assinatura XMLDSig via signxml ─────────────────────────────────────────────


def _key_pem(private_key) -> bytes:
    return private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    )


def _build_qr_url(
    inf_dce_el: etree._Element, access_key: str, base_qr: str, private_key
):
    tp_amb_el = inf_dce_el.find('.//' + _dce('tpAmb'))
    tp_amb_val = tp_amb_el.text if tp_amb_el is not None else '2'
    tp_emis_el = inf_dce_el.find('.//' + _dce('tpEmis'))
    tp_emis_val = tp_emis_el.text if tp_emis_el is not None else '1'

    params = {
        'chDCe': access_key,
        'tpAmb': tp_amb_val,
    }

    # Contingência offline: inclui identificação do usuário emitente e assinatura SHA-1.
    if tp_emis_val == '9':
        cnpj_el = inf_dce_el.find('.//' + _dce('emit') + '/' + _dce('CNPJ'))
        cpf_el = inf_dce_el.find('.//' + _dce('emit') + '/' + _dce('CPF'))
        cnpj = (cnpj_el.text or '').strip() if cnpj_el is not None else ''
        cpf = (cpf_el.text or '').strip() if cpf_el is not None else ''

        if cnpj:
            params['CNPJ'] = cnpj
        elif cpf:
            params['CPF'] = cpf

        sign = private_key.sign(
            access_key.encode('utf-8'),
            padding.PKCS1v15(),
            hashes.SHA1(),
        )
        params['sign'] = base64.b64encode(sign).decode('utf-8')

    return f'{base_qr}?{urlencode(params)}'


def sign_dce_xml(xml_bytes: bytes, private_key, cert: x509.Certificate) -> bytes:
    inf_dce_el = etree.fromstring(xml_bytes)
    ref_id = inf_dce_el.get('Id')

    dce_el = etree.Element(_dce('DCe'), nsmap={None: DCE_NS})
    dce_el.append(inf_dce_el)

    inf_solic = etree.SubElement(dce_el, _dce('infSolicDCe'))
    etree.SubElement(inf_solic, _dce('xSolic')).text = 'Solicitacao de emissao'

    inf_supl = etree.SubElement(dce_el, _dce('infDCeSupl'))
    base_qr = getattr(
        settings, 'SEFAZ_QR_CODE_URL', 'https://www.fazenda.pr.gov.br/dce/qrcode'
    )
    consulta_url = getattr(
        settings,
        'SEFAZ_CONSULTA_CHAVE_URL',
        'https://www.fazenda.pr.gov.br/dce/consulta',
    )
    access_key = ref_id[3:] if ref_id else ''
    etree.SubElement(inf_supl, _dce('qrCodDCe')).text = _build_qr_url(
        inf_dce_el, access_key, base_qr, private_key
    )
    etree.SubElement(inf_supl, _dce('urlChave')).text = consulta_url

    signed_el = _make_signer().sign(
        dce_el,
        key=_key_pem(private_key),
        cert=[cert.public_bytes(serialization.Encoding.PEM)],
        reference_uri=f'#{ref_id}',
        id_attribute='Id',
    )
    return etree.tostring(signed_el, encoding='unicode').encode('utf-8')


def sign_evento_inplace(
    evento_el: etree._Element,
    ref_id: str,
    private_key,
    cert: x509.Certificate,
) -> etree._Element:
    return _make_signer().sign(
        evento_el,
        key=_key_pem(private_key),
        cert=[cert.public_bytes(serialization.Encoding.PEM)],
        reference_uri=f'#{ref_id}',
        id_attribute='Id',
    )
