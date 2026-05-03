"""
Cliente SEFAZ-PR para DC-e v1.00.

Cobre três serviços SOAP com mTLS (certificado A1 PKCS#12):
  - DCeAutorizacao   → authorize_dce(shipment)
  - DCeRecepcaoEvento → cancel_dce(shipment, justificativa)
  - DCeConsulta      → query_dce(access_key, tp_amb)
  - DCeStatusServico → check_status(tp_amb)

Namespaces WSDL usados como SOAPAction:
  http://www.portalfiscal.inf.br/dce/wsdl/<Servico>/<operacao>
"""

import contextlib
import logging
import os
import re
import tempfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import requests
from cryptography.hazmat.primitives import serialization
from django.conf import settings
from lxml import etree as letree

from apps.core.exceptions import SefazRejectError, SefazTransientError
from apps.core.storage import R2Storage
from apps.persons.certificate import load_certificate

from .xml_builder import sign_evento_inplace

logger = logging.getLogger(__name__)

DCE_NS = 'http://www.portalfiscal.inf.br/dce'
WSDL_BASE = 'http://www.portalfiscal.inf.br/dce/wsdl'

# Constants for magic numbers
N_PROT_LENGTH = 16
ACCESS_KEY_LENGTH = 44
CNPJ_LENGTH = 14
CPF_LENGTH = 11
JUST_MIN_LENGTH = 15
JUST_MAX_LENGTH = 255

# Códigos cStat que indicam autorização com sucesso
_STAT_AUTORIZADO = {'100'}
# Códigos que indicam erro transitório (retry)
_STAT_TRANSITORIO = {'108', '109', '214', '999'}


@dataclass
class ProcItem:
    """Item de um lote retornado pelo serviço de distribuição."""

    nsu_svd: str
    nsu_aut: str
    tipo: str  # 'DCe' | 'evento'
    ch_dce: str
    dh_recbto: datetime
    n_prot: str
    tp_evento: str | None = None


@dataclass
class DistResult:
    """Resultado de uma consulta ao serviço de distribuição."""

    ult_nsu: str
    procs: list[ProcItem] = field(default_factory=list)
    has_more: bool = False


class SefazClient:
    """
    Cliente SOAP para os webservices SEFAZ-PR do DC-e.

    Instanciar por operação — não manter como singleton em módulo, pois
    o certificado descriptografado fica em memória apenas durante o uso.
    """

    def __init__(self, company, emitter):
        self.company = company
        self.emitter = emitter

    @staticmethod
    def _normalize_justificativa(value: str) -> str:
        # XSD TString/TJust não aceita quebras de linha; colapsa whitespace.
        return re.sub(r'\s+', ' ', str(value or '')).strip()

    # ── Helpers internos ──────────────────────────────────────────────────────

    @staticmethod
    def _urls(tp_amb: int) -> dict:
        return settings.SEFAZ_DCE_URLS[tp_amb]

    def _get_session(self) -> tuple[requests.Session, list[str]]:
        """
        Monta uma Session com mTLS usando o certificado A1 da empresa.
        Retorna (session, lista_de_paths_temporarios) — o chamador é
        responsável por deletar os arquivos temporários no finally.
        """
        private_key, cert, extra_certs = load_certificate(self.emitter)

        key_pem = private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        )
        # Cadeia completa: cert folha + ACs intermediárias do PFX
        cert_chain_pem = cert.public_bytes(serialization.Encoding.PEM)
        for extra in extra_certs:
            cert_chain_pem += extra.public_bytes(serialization.Encoding.PEM)

        # ssl.SSLContext.load_cert_chain() exige paths de arquivo
        tmp_files = []
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix='.pem') as tf_cert:
                tf_cert.write(cert_chain_pem)
                tmp_files.append(tf_cert.name)
            with tempfile.NamedTemporaryFile(delete=False, suffix='.pem') as tf_key:
                tf_key.write(key_pem)
                tmp_files.append(tf_key.name)
        except Exception:
            for f in tmp_files:
                _safe_remove(f)
            raise

        session = requests.Session()
        session.cert = (tmp_files[0], tmp_files[1])  # (cert_path, key_path)
        session.timeout = settings.SEFAZ_TIMEOUT
        return session, tmp_files

    def _soap_post(self, url: str, soap_action: str, payload_xml: bytes) -> bytes:
        """
        Envia POST SOAP 1.1 com mTLS e retorna o corpo da resposta.
        O payload_xml é inserido dentro do <soapenv:Body>.
        """
        soap_ns = f'{soap_action.rsplit("/", 1)[0]}/'.encode()
        envelope = (
            b'<?xml version="1.0" encoding="UTF-8"?>'
            b'<soapenv:Envelope'
            b' xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"'
            b' xmlns:xsd="http://www.w3.org/2001/XMLSchema"'
            b' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            b'<soapenv:Header>'
            b'<dceCabecMsg xmlns="' + soap_ns + b'">'
            b'<cUF>41</cUF>'
            b'<versaoDados>1.00</versaoDados>'
            b'</dceCabecMsg>'
            b'</soapenv:Header>'
            b'<soapenv:Body>'
            b'<dceDadosMsg xmlns="' + soap_ns + b'">' + payload_xml + b'</dceDadosMsg>'
            b'</soapenv:Body>'
            b'</soapenv:Envelope>'
        )

        session, tmp_files = self._get_session()
        try:
            headers = {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': soap_action,
            }
            # Usa o bundle de CAs da ICP-Brasil para verificar o servidor da SEFAZ.
            # Se o arquivo não existir (dev/CI), desativa verificação e avisa.
            ca_bundle = getattr(settings, 'SEFAZ_CA_BUNDLE_PATH', None)
            if ca_bundle and Path(str(ca_bundle)).exists():
                verify: str | bool = str(ca_bundle)
            else:
                import warnings  # noqa: PLC0415

                warnings.warn(
                    'SEFAZ_CA_BUNDLE_PATH não configurado ou não encontrado — '
                    'verificação SSL desativada. NÃO use em produção.',
                    stacklevel=2,
                )
                verify = False
            resp = session.post(
                url,
                data=envelope,
                headers=headers,
                verify=verify,
            )
            resp.raise_for_status()
            return resp.content
        finally:
            for f in tmp_files:
                _safe_remove(f)

    @staticmethod
    def _parse_response(resp_bytes: bytes) -> ET.Element:
        """Extrai o elemento raiz do Body SOAP ou do XML puro."""
        root = ET.fromstring(resp_bytes)
        # Tenta encontrar o conteúdo dentro do Body SOAP
        body = root.find('.//{http://schemas.xmlsoap.org/soap/envelope/}Body')
        if body is not None and len(body):
            return next(iter(body))
        return root

    @staticmethod
    def _check_stat(root: ET.Element, ok_stats: set[str]) -> None:
        """Verifica cStat e lança exceção adequada se necessário."""
        ns = DCE_NS
        c_stat = root.findtext(f'.//{{{ns}}}cStat') or ''
        x_motivo = root.findtext(f'.//{{{ns}}}xMotivo') or ''
        if c_stat in ok_stats:
            return
        if c_stat in _STAT_TRANSITORIO or not c_stat:
            raise SefazTransientError(c_stat, x_motivo)
        raise SefazRejectError(c_stat, x_motivo)

    # ── Serviços públicos ─────────────────────────────────────────────────────

    def authorize_dce(
        self, shipment, xml_bytes: bytes | None = None
    ) -> tuple[str, datetime]:
        """
        Envia o XML assinado à SEFAZ e retorna (n_prot, dh_recbto).
        Idempotente: retorna o protocolo existente se já autorizado.
        """
        if shipment.n_prot:
            return shipment.n_prot, shipment.dh_recbto

        if xml_bytes is None:
            if not shipment.xml_key:
                raise ValueError('xml_bytes ou shipment.xml_key deve ser fornecido')
            storage = R2Storage()
            xml_bytes = storage.get_file(shipment.xml_key)

        logger.debug(
            'authorize_dce: sending XML (%d bytes): %s', len(xml_bytes), xml_bytes[:800]
        )

        url = self._urls(shipment.tp_amb)['autorizacao']
        soap_action = f'{WSDL_BASE}/DCeAutorizacao/dceAutorizacaoLote'
        resp_bytes = self._soap_post(url, soap_action, xml_bytes)

        logger.debug('authorize_dce: SEFAZ response: %s', resp_bytes[:800])

        ns = DCE_NS
        root = self._parse_response(resp_bytes)
        self._check_stat(root, _STAT_AUTORIZADO)

        n_prot = root.findtext(f'.//{{{ns}}}nProt') or ''
        dh_str = root.findtext(f'.//{{{ns}}}dhRecbto') or ''
        dh_recbto = datetime.fromisoformat(dh_str)
        return n_prot, dh_recbto

    def check_status(self, tp_amb: int) -> dict:
        """
        Consulta o status do serviço SEFAZ.
        Retorna dict com cStat e xMotivo.
        """
        payload = (
            f'<consStatServ xmlns="{DCE_NS}" versao="1.00">'
            f'<tpAmb>{tp_amb}</tpAmb>'
            f'<cUF>41</cUF>'
            f'<xServ>STATUS</xServ>'
            f'</consStatServ>'
        ).encode()

        url = self._urls(tp_amb)['status']
        soap_action = f'{WSDL_BASE}/DCeStatusServico/dceStatusServicoNF'
        resp_bytes = self._soap_post(url, soap_action, payload)

        ns = DCE_NS
        root = self._parse_response(resp_bytes)
        return {
            'c_stat': root.findtext(f'.//{{{ns}}}cStat') or '',
            'x_motivo': root.findtext(f'.//{{{ns}}}xMotivo') or '',
            'dh_recbto': root.findtext(f'.//{{{ns}}}dhRecbto') or '',
        }

    def query_dce(self, access_key: str, tp_amb: int) -> dict:
        """
        Consulta situação de um DCe pela chave de acesso.
        Retorna dict com cStat, xMotivo, nProt, dhRecbto.
        """
        payload = (
            f'<consDCe xmlns="{DCE_NS}" versao="1.00">'
            f'<tpAmb>{tp_amb}</tpAmb>'
            f'<xServ>CONSULTAR</xServ>'
            f'<chDCe>{access_key}</chDCe>'
            f'</consDCe>'
        ).encode()

        url = self._urls(tp_amb)['consulta']
        soap_action = f'{WSDL_BASE}/DCeConsulta/dceProcDCe'
        resp_bytes = self._soap_post(url, soap_action, payload)

        ns = DCE_NS
        root = self._parse_response(resp_bytes)
        return {
            'c_stat': root.findtext(f'.//{{{ns}}}cStat') or '',
            'x_motivo': root.findtext(f'.//{{{ns}}}xMotivo') or '',
            'n_prot': root.findtext(f'.//{{{ns}}}nProt') or '',
            'dh_recbto': root.findtext(f'.//{{{ns}}}dhRecbto') or '',
        }

    def cancel_dce(self, shipment, justificativa: str) -> tuple[str, datetime, bytes]:
        """
        Envia evento de cancelamento (tpEvento=110111) à SEFAZ.
        Retorna (n_prot_cancel, dh_cancel, xml_env_evento_assinado).
        """
        from django.utils import timezone  # noqa: PLC0415

        brt_tz = timezone.get_fixed_timezone(-180)
        now_iso = timezone.now().astimezone(brt_tz).strftime('%Y-%m-%dT%H:%M:%S-03:00')
        xml_payload, _signed_evento_el = self._build_cancel_xml(
            shipment, justificativa, now_iso
        )
        logger.debug(
            'cancel_dce: sending XML (%d bytes): %s',
            len(xml_payload),
            xml_payload[:1200],
        )

        url = self._urls(shipment.tp_amb)['eventos']
        soap_action = f'{WSDL_BASE}/DCeRecepcaoEvento/dceRecepcaoEvento'
        resp_bytes = self._soap_post(url, soap_action, xml_payload)
        logger.debug('cancel_dce: SEFAZ response: %s', resp_bytes[:1000])

        ns = DCE_NS
        root = self._parse_response(resp_bytes)
        # cStat 135 = Evento registrado e vinculado a DC-e
        self._check_stat(root, {'135'})

        n_prot = root.findtext(f'.//{{{ns}}}nProt') or ''
        dh_str = root.findtext(f'.//{{{ns}}}dhRegEvento') or ''
        dh_cancel = datetime.fromisoformat(dh_str)
        return n_prot, dh_cancel, xml_payload

    def _resolve_cancel_parties_docs(self, shipment) -> tuple[str, str]:
        participants = (
            shipment.participants_snapshot
            if isinstance(getattr(shipment, 'participants_snapshot', None), dict)
            else {}
        )
        emitter_actor = participants.get('emitter') or {}
        emit_snapshot = getattr(shipment, 'emit_snapshot', None) or {}

        actor_doc = ''.join(
            filter(
                str.isdigit,
                (emitter_actor.get('cnpj') or emitter_actor.get('document') or ''),
            )
        )
        emit_doc = ''.join(
            filter(
                str.isdigit,
                (
                    emit_snapshot.get('document')
                    or emit_snapshot.get('cnpj')
                    or getattr(self.emitter, 'document', '')
                    or ''
                ),
            )
        )
        user_emit_doc = emit_doc or actor_doc
        cnpj_autor = ''.join(
            filter(
                str.isdigit,
                (
                    emitter_actor.get('cnpj')
                    or (actor_doc if len(actor_doc) == CNPJ_LENGTH else '')
                    or emit_snapshot.get('cnpj')
                    or (emit_doc if len(emit_doc) == CNPJ_LENGTH else '')
                    or getattr(self.emitter, 'document', '')
                    or getattr(self.company, 'cnpj', '')
                    or ''
                ),
            )
        )
        return cnpj_autor, user_emit_doc

    def _build_cancel_xml(self, shipment, justificativa, now_iso):
        just = self._normalize_justificativa(justificativa)
        n_prot = (shipment.n_prot or '').strip()
        access_key = (shipment.access_key or '').strip()
        # Regra de cancelamento: o usuário emitente do evento deve seguir
        # o mesmo usuário emitente da DC-e autorizada (C02/C02a),
        # que no nosso fluxo vem do bloco <emit> (remetente/emit_snapshot).
        cnpj_autor, user_emit_doc = self._resolve_cancel_parties_docs(shipment)

        if not n_prot:
            raise SefazRejectError('Cancelamento sem protocolo de autorização (nProt).')
        if len(n_prot) != N_PROT_LENGTH or not n_prot.isdigit():
            raise SefazRejectError(
                f'Protocolo de autorização inválido para cancelamento '
                f'(nProt deve ter {N_PROT_LENGTH} dígitos).'
            )
        if len(access_key) != ACCESS_KEY_LENGTH or not access_key.isdigit():
            raise SefazRejectError('Chave de acesso inválida para cancelamento.')
        if len(cnpj_autor) != CNPJ_LENGTH or not cnpj_autor.isdigit():
            raise SefazRejectError(
                'CNPJ do autor inválido para cancelamento (CNPJAutor).'
            )
        if (
            len(user_emit_doc) not in {CPF_LENGTH, CNPJ_LENGTH}
            or not user_emit_doc.isdigit()
        ):
            raise SefazRejectError('Documento do emitente inválido para cancelamento.')
        if len(just) < JUST_MIN_LENGTH or len(just) > JUST_MAX_LENGTH:
            raise SefazRejectError(
                f'Justificativa inválida para cancelamento '
                f'(deve ter entre {JUST_MIN_LENGTH} e {JUST_MAX_LENGTH} caracteres).'
            )

        # Id = "ID" + tpEvento(6) + chDCe(44) + nSeqEvento(3) = ID + 53 dígitos
        seq_id = f'ID110111{shipment.access_key}001'
        private_key, cert, _extra = load_certificate(self.emitter)

        ns = DCE_NS
        inf_el = letree.Element(
            f'{{{ns}}}infEvento',
            Id=seq_id,
            nsmap={None: ns},
        )
        # cOrgao: UF autorizadora inferida da chave de acesso (2 primeiros dígitos).
        letree.SubElement(inf_el, f'{{{ns}}}cOrgao').text = access_key[:2]
        letree.SubElement(inf_el, f'{{{ns}}}tpAmb').text = str(shipment.tp_amb)
        letree.SubElement(inf_el, f'{{{ns}}}tpEmit').text = str(shipment.tp_emit)
        letree.SubElement(inf_el, f'{{{ns}}}CNPJAutor').text = cnpj_autor
        if len(user_emit_doc) == CNPJ_LENGTH:
            letree.SubElement(inf_el, f'{{{ns}}}CNPJUsEmit').text = user_emit_doc
        else:
            letree.SubElement(inf_el, f'{{{ns}}}CPFUsEmit').text = user_emit_doc
        letree.SubElement(inf_el, f'{{{ns}}}chDCe').text = access_key
        letree.SubElement(inf_el, f'{{{ns}}}dhEvento').text = now_iso
        letree.SubElement(inf_el, f'{{{ns}}}tpEvento').text = '110111'
        letree.SubElement(inf_el, f'{{{ns}}}nSeqEvento').text = '1'
        det_el = letree.SubElement(inf_el, f'{{{ns}}}detEvento', versaoEvento='1.00')
        ev_canc_el = letree.SubElement(det_el, f'{{{ns}}}evCancDCe')
        letree.SubElement(ev_canc_el, f'{{{ns}}}descEvento').text = 'Cancelamento'
        letree.SubElement(ev_canc_el, f'{{{ns}}}nProt').text = n_prot
        letree.SubElement(ev_canc_el, f'{{{ns}}}xJust').text = just

        ev_el = letree.Element(f'{{{ns}}}eventoDCe', versao='1.00', nsmap={None: ns})
        ev_el.append(inf_el)
        signed_el = sign_evento_inplace(ev_el, inf_el.get('Id'), private_key, cert)

        return letree.tostring(signed_el, encoding='unicode').encode('utf-8'), signed_el

    def distribute_dce(self, ult_nsu: str, tp_amb: int) -> DistResult:
        """
        Consulta o serviço de distribuição de DC-e (distDCe).
        ult_nsu deve ser informado (ex: '0' para começar).
        """
        cnpj = ''.join(filter(str.isdigit, self.company.cnpj or ''))
        payload = (
            f'<distDCe xmlns="{DCE_NS}" versao="1.00">'
            f'<tpAmb>{tp_amb}</tpAmb>'
            f'<cUFAutoriz>41</cUFAutoriz>'
            f'<CNPJ>{cnpj}</CNPJ>'
            f'<ultNSU>{ult_nsu}</ultNSU>'
            f'</distDCe>'
        ).encode()

        url = self._urls(tp_amb)['distribuicao']
        soap_action = f'{WSDL_BASE}/DCeDistribuicao/dceDistNSU'
        resp_bytes = self._soap_post(url, soap_action, payload)

        ns = DCE_NS
        root = self._parse_response(resp_bytes)
        # cStat 138 = Documento localizado
        # cStat 137 = Nenhum documento localizado
        self._check_stat(root, {'137', '138'})

        result = DistResult(ult_nsu=root.findtext(f'.//{{{ns}}}ultNSU') or ult_nsu)

        # Parse dos documentos retornados (se houver)
        doc_zip_els = root.findall(f'.//{{{ns}}}docZip')
        for doc_el in doc_zip_els:
            import base64 as _base64  # noqa: PLC0415
            import gzip as _gzip  # noqa: PLC0415

            # Conteúdo é base64 de um GZIP de um XML
            content_gz = _base64.b64decode(doc_el.text)
            xml_doc = _gzip.decompress(content_gz)
            doc_root = ET.fromstring(xml_doc)

            # Identifica o tipo de documento
            if doc_root.tag.endswith('resDCe'):
                result.procs.append(
                    ProcItem(
                        nsu_svd=doc_el.get('NSU'),
                        nsu_aut=doc_el.get('NSU'),
                        tipo='DCe',
                        ch_dce=doc_root.findtext(f'.//{{{ns}}}chDCe') or '',
                        dh_recbto=datetime.fromisoformat(
                            doc_root.findtext(f'.//{{{ns}}}dhRecbto') or ''
                        ),
                        n_prot=doc_root.findtext(f'.//{{{ns}}}nProt') or '',
                    )
                )
            elif doc_root.tag.endswith('resEvento'):
                result.procs.append(
                    ProcItem(
                        nsu_svd=doc_el.get('NSU'),
                        nsu_aut=doc_el.get('NSU'),
                        tipo='evento',
                        ch_dce=doc_root.findtext(f'.//{{{ns}}}chDCe') or '',
                        dh_recbto=datetime.fromisoformat(
                            doc_root.findtext(f'.//{{{ns}}}dhRegEvento') or ''
                        ),
                        n_prot=doc_root.findtext(f'.//{{{ns}}}nProt') or '',
                        tp_evento=doc_root.findtext(f'.//{{{ns}}}tpEvento'),
                    )
                )

        return result


# ── Utilitários ───────────────────────────────────────────────────────────────


def _safe_remove(path: str) -> None:
    """Remove arquivo temporário ignorando erros."""
    with contextlib.suppress(OSError):
        os.unlink(path)
