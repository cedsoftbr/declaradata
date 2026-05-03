# /sefaz-safe

Checklist de segurança antes de mergear qualquer mudança que afete a integração com a SEFAZ-PR. Foca em riscos de comunicação, certificados e fluxo de autorização/cancelamento.

## Quando usar

Antes de fazer deploy ou merge de mudanças em:
- `api/apps/shipments/sefaz_client.py`
- `api/apps/shipments/services.py`
- `api/apps/shipments/tasks.py`
- `api/apps/companies/` (certificado da empresa)
- `api/apps/persons/certificate.py` (certificado do emitente)
- Qualquer variável de ambiente relacionada a `SEFAZ_*`

## O que verificar

### Certificados A1

- Certificados cifrados com Fernet (`CERTIFICATE_ENCRYPTION_KEY`) — mudança na chave invalida todos os certificados em produção
- Carregamento via `load_certificate()` em `apps/persons/certificate.py` — qualquer alteração na descriptografia quebra todas as emissões
- mTLS: o certificado é escrito em arquivo temporário (`tempfile`) e removido após uso — garantir que não vaza em exceções

### Comunicação SEFAZ

- URLs dos webservices por ambiente:
  - Produção: `https://dce.fazenda.pr.gov.br/...`
  - Homologação: `https://hom.dce.fazenda.pr.gov.br/...`
- `SEFAZ_TIMEOUT` (padrão 30s) — nunca remover o timeout
- Bundle ICP-Brasil em `SEFAZ_CA_BUNDLE_PATH` — necessário para validar o certificado do servidor da SEFAZ
- SOAPAction via header — formato: `http://www.portalfiscal.inf.br/dce/wsdl/{Servico}/{operacao}`

### Códigos de retorno cStat

| cStat | Significado | Ação correta |
|-------|-------------|--------------|
| `100` | Autorizado | Salvar `n_prot`, marcar `authorized` |
| `101` | Cancelado | Marcar `cancelled` |
| `108`, `109`, `214`, `999` | Transitório (retry) | Reagendar task, não marcar como rejeitado |
| Qualquer outro | Rejeitado | Marcar `rejected`, salvar `x_motivo` |

Nunca tratar código transitório como rejeição definitiva.

### Cancelamento

- Prazo máximo: 30 dias após autorização (verificar se o check existe)
- Justificativa: mínimo 15 caracteres, máximo 255
- `n_prot` da autorização original é obrigatório no evento de cancelamento
- Após cancelamento bem-sucedido, XML de cancelamento deve ser salvo no R2

### Fluxo de estados (django-fsm)

Transições válidas — qualquer mudança fora desse fluxo corrompe os dados:
```
draft → processing → authorized
                  └→ rejected
authorized → cancelling → cancelled
```
Nunca chamar `save()` diretamente em um Shipment para mudar o status — sempre via transição FSM.

### Celery tasks

- `emit_shipment_task` e `cancel_shipment_task` devem ser idempotentes — podem ser re-executadas em caso de falha
- Não remover `@shared_task` ou alterar o nome da task sem considerar tasks pendentes na fila
- Em produção: `--max-tasks-per-child=50` para evitar leak de memória de arquivos de certificado temporários

### Checklist final antes do deploy

- [ ] Testes de shipments passando: `pytest apps/shipments/ -q`
- [ ] Nenhuma mudança nas URLs dos webservices SEFAZ sem validação em homologação primeiro
- [ ] Nenhuma mudança no algoritmo de assinatura (RSA-SHA1 é obrigatório)
- [ ] `CERTIFICATE_ENCRYPTION_KEY` não foi alterada no ambiente de produção
- [ ] Variáveis `SEFAZ_*` conferidas no Railway antes do deploy
- [ ] Testado em Simulado → Homologação → só então Produção
