from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

from django.conf import settings
from lxml import etree

from .xml_constants import DCE_NS

CNPJ_LENGTH = 14
ACCESS_KEY_PRE_DV_LEN = 43
BRT_TZ = timezone(timedelta(hours=-3))
DEFAULT_DCE_XSD_REL_PATH = Path('documentacao_oficial/xsd/pl100/dce/dce_v1.00.xsd')


def _dce(tag: str) -> str:
    return f'{{{DCE_NS}}}{tag}'


def _text(parent: etree._Element, path: str) -> str:
    el = parent.find(path)
    return (el.text or '').strip() if el is not None else ''


def _to_brt_aamm(dh_emi: str) -> str:
    dt = datetime.fromisoformat(dh_emi.replace('Z', '+00:00'))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=BRT_TZ)
    return dt.astimezone(BRT_TZ).strftime('%y%m')


def _calculate_dv(pre_key: str) -> int:
    weights = ([2, 3, 4, 5, 6, 7, 8, 9] * 6)[:ACCESS_KEY_PRE_DV_LEN]
    weights.reverse()
    total = sum(int(d) * w for d, w in zip(pre_key, weights, strict=True))
    rem = total % 11
    return 0 if rem in {0, 1} else 11 - rem


def _resolve_xsd_path() -> Path:
    configured = getattr(settings, 'SEFAZ_DCE_XSD_PATH', '')
    if configured:
        return Path(configured)
    # .../api/apps/shipments/xml_validator.py -> repo root
    root_dir = Path(__file__).resolve().parents[3]
    return root_dir / DEFAULT_DCE_XSD_REL_PATH


@lru_cache(maxsize=4)
def _load_schema(xsd_path: str) -> etree.XMLSchema:
    tree = etree.parse(xsd_path)
    return etree.XMLSchema(tree)


def validate_inf_dce_access_key(  # noqa: PLR0914
    xml_bytes: bytes, expected_access_key: str | None = None
) -> None:
    root = etree.fromstring(xml_bytes)
    inf_dce = root if root.tag == _dce('infDCe') else root.find(_dce('infDCe'))
    if inf_dce is None:
        raise ValueError('Elemento infDCe não encontrado.')

    ide = inf_dce.find(_dce('ide'))
    emit = inf_dce.find(_dce('emit'))
    if ide is None or emit is None:
        raise ValueError('Blocos ide/emit não encontrados no infDCe.')

    c_uf = _text(ide, _dce('cUF')).zfill(2)[:2]
    aa_mm = _to_brt_aamm(_text(ide, _dce('dhEmi')))
    tp_emit = _text(ide, _dce('tpEmit')) or '0'
    cnpj = ''
    if tp_emit == '1':
        cnpj = _text(inf_dce, _dce('Marketplace') + '/' + _dce('CNPJ'))
    elif tp_emit == '2':
        cnpj = _text(emit, _dce('CNPJ'))
    elif tp_emit == '3':
        cnpj = _text(inf_dce, _dce('Transportadora') + '/' + _dce('CNPJ'))
    elif tp_emit == '4':
        cnpj = _text(inf_dce, _dce('ECT') + '/' + _dce('CNPJ'))
    if not cnpj:
        cnpj = _text(emit, _dce('CNPJ'))
    cnpj = cnpj.zfill(CNPJ_LENGTH)[:CNPJ_LENGTH]
    mod = _text(ide, _dce('mod')).zfill(2)[:2]
    serie = f'{int(_text(ide, _dce("serie")) or 0):03d}'
    number = f'{int(_text(ide, _dce("nDC")) or 0):09d}'
    tp_emis = _text(ide, _dce('tpEmis')) or '1'
    n_site = _text(ide, _dce('nSiteAutoriz')) or '0'
    c_dc = _text(ide, _dce('cDC')).zfill(6)[:6]
    c_dv_xml = _text(ide, _dce('cDV'))

    pre_key = f'{c_uf}{aa_mm}{cnpj}{mod}{serie}{number}{tp_emis}{tp_emit}{n_site}{c_dc}'
    dv = _calculate_dv(pre_key)
    computed_key = f'{pre_key}{dv}'

    if c_dv_xml and c_dv_xml != str(dv):
        raise ValueError(f'cDV inválido no XML. Esperado={dv}, recebido={c_dv_xml}.')

    xml_id = (inf_dce.get('Id') or '').strip()
    if xml_id != f'DCe{computed_key}':
        raise ValueError(
            'Campo Id não corresponde à chave calculada pelos campos do XML '
            f'(esperado=DCe{computed_key}, recebido={xml_id or "<vazio>"}).'
        )

    if expected_access_key and expected_access_key.strip() != computed_key:
        raise ValueError(
            'access_key da remessa diverge da chave calculada pelo XML '
            f'(esperado={computed_key}, recebido={expected_access_key}).'
        )


def validate_dce_schema(xml_bytes: bytes) -> None:
    xsd_path = _resolve_xsd_path()
    if not xsd_path.exists():
        raise ValueError(f'XSD oficial não encontrado: {xsd_path}')

    try:
        schema = _load_schema(str(xsd_path))
        xml_root = etree.fromstring(xml_bytes)
        schema.assertValid(xml_root)
    except etree.DocumentInvalid as e:
        detail = schema.error_log.last_error.message if schema.error_log else str(e)
        raise ValueError(f'XML inválido no XSD oficial: {detail}') from e
    except etree.XMLSyntaxError as e:
        raise ValueError(f'XML malformado: {e}') from e
