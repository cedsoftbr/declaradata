# /dce-review

Revisa mudanças que tocam na geração ou validação do XML do DC-e, garantindo que nenhuma alteração quebra a estrutura exigida pela SEFAZ-PR.

## Quando usar

Antes de qualquer commit que modifique:
- `api/apps/shipments/xml_builder.py`
- `api/apps/shipments/xml_validator.py`
- `api/apps/shipments/xml_constants.py`
- `api/apps/shipments/services.py`
- `api/apps/shipments/sefaz_client.py`
- `api/apps/shipments/serializers.py`
- `api/apps/persons/certificate.py`

## O que fazer

### 1. Identificar o que mudou

Leia os arquivos modificados e descreva em 1-2 linhas o que cada mudança faz.

### 2. Verificar integridade do XML

Checar se as seguintes invariantes do DC-e v1.00 continuam válidas:

**Namespace e versão**
- `DCE_NS = 'http://www.portalfiscal.inf.br/dce'` deve estar inalterado em `xml_constants.py`
- Tag raiz: `<DCe>` contendo `<infDCe versao="1.00">`
- Atributo `Id` do `infDCe` deve ser `DCe{access_key}` (44 chars)

**Ordem obrigatória das tags dentro de `infDCe`**
```
ide → emit → [Marketplace|EmpEmisProp|Transportadora] → dest → det(n) → total → transp → infDec
```
Qualquer reordenação quebra validação XSD da SEFAZ.

**Chave de acesso (44 dígitos)**
Campos que compõem a chave — alteração em qualquer um invalida todas as emissões:
`cUF(2) + AAMM(4) + CNPJ(14) + mod(2=99) + serie(3) + nDC(9) + tpEmis(1) + tpEmit(1) + nSiteAutoriz(1) + cDC(6) + cDV(1)`

**Assinatura XMLDSig**
- Algoritmo: RSA-SHA1 (obrigatório pela SEFAZ-PR — não pode ser trocado por SHA256)
- Canonicalização: C14N 1.0
- Referência: `#{ref_id}` apontando para o `Id` do `infDCe`
- `Signature` sem prefixo de namespace

**Ambiente**
- `tpAmb=1` → Produção (XML real, emissão irreversível)
- `tpAmb=2` → Homologação (`xNome` do destinatário vira `DCE EMITIDA EM AMBIENTE DE HOMOLOGACAO`)
- `tpAmb=3` → Simulado (sem envio à SEFAZ)

**Snapshot**
- `emit_snapshot`, `recipient_snapshot`, `carrier_snapshot`, `participants_snapshot` são tirados no momento da emissão e não mudam depois — nunca usar dados ao vivo do model para gerar XML.

### 3. Rodar os testes de XML e integração

```bash
cd api && .venv/bin/pytest apps/shipments/tests/test_xml.py apps/shipments/tests/test_xml_validator.py apps/shipments/tests/test_services.py apps/shipments/tests/test_complete_flow.py -v
```

### 4. Reportar

Listar:
- O que foi alterado e se é seguro
- Qualquer invariante em risco, com o trecho exato de código
- Resultado dos testes
- Recomendação: **seguro para commitar** / **requer ajuste** (com o ajuste específico)
