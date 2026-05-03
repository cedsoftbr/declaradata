# Declaradata — API

API REST Django para emissão e gestão de DC-e integrada à SEFAZ-PR. SaaS multi-tenant com isolamento por `company_id`.

## Stack

- Python 3.14, Django 5, Django REST Framework
- PostgreSQL + psycopg2-binary
- Celery + Redis (tarefas assíncronas: emissão, cancelamento, exportação)
- signxml (assinatura XMLDSig), WeasyPrint (PDF), openpyxl (Excel)
- Cloudflare R2 via boto3 (storage de XMLs e PDFs)
- Fernet (cryptography) para cifrar certificados A1 em repouso
- drf-spectacular (OpenAPI 3 / Swagger UI em `/api/docs/`)
- djangorestframework-simplejwt (JWT com refresh + blacklist)
- django-fsm-2 (máquina de estados do DC-e)
- Sentry para monitoramento de erros em produção
- Gunicorn em produção, Railway para deploy

## Estrutura

```
config/          — settings, urls, wsgi, asgi, celery, schema
apps/
  companies/     — tenant: empresa, certificado digital, limites de uso
  persons/       — pessoas físicas/jurídicas, certificado A1 por emitente
  products/      — catálogo de produtos (NCM)
  shipments/     — DC-e: modelo, serializers, views, tasks, PDF, XML
  users/         — usuários, roles, permissões por módulo
  locations/     — países, estados, municípios (IBGE)
  core/          — storage R2, paginação, exceções, utilitários
```

## Comandos de Desenvolvimento

```bash
poetry install           # instala dependências
poetry run task dev      # API + Celery worker em paralelo
poetry run task migrate  # aplica migrações
poetry run task test     # pytest -s -x -vv
poetry run task lint     # ruff check
poetry run task format   # ruff format
```

## Padrões de Código

### Geral
- Ruff para lint e format. Linha máxima: 88 caracteres. Aspas simples.
- Sem comentários óbvios — apenas quando o WHY não é evidente no código.
- Sem backwards-compat hacks, sem features flags, sem abstrações prematuras.
- Sem tratamento de erros para cenários impossíveis; confie nas garantias do framework.

### Models
- PKs sempre UUID v7 (`uuid.uuid7`): `id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)`
- Todo model multi-tenant tem FK para `companies.Company` — nunca retorne dados sem filtrar por `company`.
- Campos de auditoria: `created_at = auto_now_add`, `updated_at = auto_now`.
- `ClassVar[list]` para `ordering`, `constraints` e outros atributos de classe no `Meta`.
- Choices como `TextChoices` ou `IntegerChoices` dentro do próprio model.

### Views / ViewSets
- Sempre definir `module_name` nos ViewSets operacionais para o `HasModulePermission` funcionar.
- Filtrar queryset por `request.user.company` para usuários não-superadmin. Superadmin vê tudo.
- Processamento pesado (emissão, cancelamento, exportação) → sempre Celery task, nunca síncrono na view.
- Download de arquivos protegidos por token assinado com `django.core.signing.TimestampSigner`.

### Permissões
Quatro perfis fixos: `superadmin`, `admin`, `emissor`, `viewer`.
- `IsSuperAdmin` — acesso irrestrito.
- `IsCompanyManager` — admin da empresa, gerencia usuários/roles da própria empresa.
- `HasModulePermission` — verifica `module_name` + ação (list/create/update/destroy) contra o perfil do usuário.
- Object-level: verificar `obj.company_id == request.user.company_id` (já feito em `HasModulePermission.has_object_permission`).

### Celery
- Tasks decoradas com `@shared_task`.
- Em testes: `CELERY_TASK_ALWAYS_EAGER=True` — tasks rodam síncronas, sem broker real.
- Worker de produção: `--concurrency=1 --max-tasks-per-child=50 --without-gossip --without-mingle --without-heartbeat`.

### Criptografia de Certificados
- Certificados A1 (.pfx) cifrados com Fernet antes de salvar no banco.
- Chave em `CERTIFICATE_ENCRYPTION_KEY` (variável de ambiente obrigatória).
- Funções em `apps/companies/crypto.py` e `apps/companies/services.py`.

### Testes
- pytest + pytest-django + factory-boy.
- Fixtures em `conftest.py` nos diretórios de cada app.
- Banco de teste: `--reuse-db` para agilizar. Celery: `ALWAYS_EAGER=True`.
- Ignorar warnings de `django-fsm`, `botocore`, `staticfiles` (já configurado em `pytest.ini`).
- Arquivos de teste: `test_*.py` dentro de `apps/<app>/tests/`.

## Ciclo de Vida do DC-e

```
draft → processing → authorized
                  └→ rejected

authorized → cancelling → cancelled
```

Transições gerenciadas por `django-fsm`. Toda mudança de estado dispara uma Celery task (`emit_shipment_task`, `cancel_shipment_task`).

## Ambientes SEFAZ

| Valor | Nome |
|-------|------|
| 1 | Produção |
| 2 | Homologação |
| 3 | Simulado (sem envio real à SEFAZ) |

## Deploy

Dois serviços Railway a partir da mesma imagem Docker:
- `DRF`: gunicorn com 2 workers. Migrações rodam no pre-deploy.
- `Worker`: celery worker com concurrency 1.

Para criar superusuário em produção, usar `railway ssh --service DRF` e executar `python manage.py createsuperuser` diretamente (taskipy não está instalado no container de produção).
