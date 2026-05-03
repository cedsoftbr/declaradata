# Declaradata — API

API REST do Declaradata, plataforma SaaS para emissão e gestão de DC-e (Documento de Conhecimento eletrônico).

## Visão Geral

Centraliza o ciclo de vida completo do DC-e: criação, assinatura digital XMLDSig com certificado A1, autorização pela SEFAZ, cancelamento e consulta de distribuição. O processamento pesado (emissão, cancelamento, exportação) é executado de forma assíncrona via Celery. Dados de cada empresa são isolados por `company_id` em todas as queries.

## Stack

| Camada | Tecnologia |
|--------|------------|
| Runtime | Python 3.14 |
| Framework | Django 5 + Django REST Framework |
| Banco | PostgreSQL |
| Fila | Celery + Redis |
| Assinatura XML | signxml (XMLDSig) |
| PDF | WeasyPrint |
| Storage | Cloudflare R2 (boto3) |
| E-mail | Brevo (backend customizado) |
| Auth | JWT via djangorestframework-simplejwt |
| Docs da API | drf-spectacular (OpenAPI 3) |
| Deploy | Docker + Railway |
| Monitoramento | Sentry |

## Funcionalidades

- Emissão e cancelamento de DC-e integrado à SEFAZ (produção e homologação)
- Ambiente **Simulado** para testes sem envio à SEFAZ
- Assinatura digital XMLDSig com certificado A1 (.pfx/.p12) por emitente
- Certificado cifrado em repouso com Fernet (`CERTIFICATE_ENCRYPTION_KEY`)
- Consulta automática de distribuição DC-e em background (Celery)
- Geração de PDF do DC-e com código de barras e QR code
- Exportação de lotes em PDF e relatórios Excel (.xlsx) via tarefas assíncronas
- Armazenamento de XMLs e PDFs no Cloudflare R2
- Download de arquivos por token assinado com validade de 1 hora (sem exigir JWT)
- Autenticação JWT por e-mail com refresh token e blacklist
- Controle de acesso RBAC com permissões granulares por módulo

## Módulos

| App | Responsabilidade |
|-----|-----------------|
| `companies` | Cadastro de empresas (tenants), certificado digital da empresa, limites de uso |
| `persons` | Cadastro de pessoas físicas/jurídicas (emitentes, remetentes, destinatários, transportadoras) e certificado A1 por emitente |
| `products` | Catálogo de produtos/mercadorias |
| `shipments` | DC-e: criação, emissão, cancelamento, série de numeração, PDF, XML, exportação |
| `locations` | Países, estados e municípios (IBGE) |
| `users` | Usuários, roles, permissões por módulo |
| `core` | Storage (R2), paginação, exceções, utilitários |

## Endpoints Principais

```
/api/auth/          — login, logout, refresh, change-password, reset-password
/api/users/         — CRUD de usuários
/api/users/roles/   — CRUD de roles e permissões por módulo
/api/companies/     — CRUD de empresas + upload/remoção de certificado
/api/persons/       — CRUD de pessoas + certificado A1 por emitente + séries
/api/products/      — CRUD de produtos
/api/shipments/     — CRUD de DC-e + emissão + cancelamento + PDF + XML + exportação
/api/shipments/series/ — Séries de numeração por emitente/ambiente
/api/locations/     — Países, estados, municípios
/api/schema/        — OpenAPI 3 (drf-spectacular)
/api/docs/          — Swagger UI
```

## Modelo de Permissões

Os perfis de usuário são fixos e determinam o acesso por módulo:

| Perfil | Produtos | Pessoas | DC-e | Gerencia usuários |
|--------|----------|---------|------|-------------------|
| `superadmin` | CRUD | CRUD | CRUD | Sim (global) |
| `admin` | CRUD | CRUD | CRUD | Sim (empresa) |
| `emissor` | CRUD | CRUD | CRUD | Não |
| `viewer` | Visualiza | Visualiza | Visualiza | Não |

Roles adicionais com permissões granulares (`can_view`, `can_create`, `can_edit`, `can_delete`) podem ser criadas por empresa. O superadmin pode criar roles globais visíveis a todas as empresas.

## Ciclo de Vida do DC-e

```
draft → processing → authorized
                  └→ rejected

authorized → cancelling → cancelled
```

Estados gerenciados por `django-fsm-2`. Transições são executadas como tarefas Celery (`emit_shipment_task`, `cancel_shipment_task`).

## Configuração Local

### Pré-requisitos

- Python 3.14+
- PostgreSQL
- Redis
- Poetry

### Passos

1. Instale as dependências:
   ```bash
   poetry install
   ```

2. Configure as variáveis de ambiente:
   ```bash
   cp .env.example .env
   # edite .env com seus valores
   ```

3. Execute as migrações:
   ```bash
   poetry run task migrate
   ```

4. Crie o primeiro superusuário:
   ```bash
   poetry run task superuser
   ```

5. Inicie API e worker em paralelo:
   ```bash
   poetry run task dev
   ```

### Tasks disponíveis

| Task | Comando |
|------|---------|
| `task run` | Django dev server |
| `task worker` | Celery worker |
| `task dev` | API + Worker em paralelo |
| `task migrate` | Aplica migrações |
| `task superuser` | Cria superusuário interativamente |
| `task test` | Roda testes com pytest |
| `task lint` | Ruff check |
| `task format` | Ruff format |

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `SECRET_KEY` | Sim | Chave secreta do Django |
| `DEBUG` | — | `False` em produção |
| `ALLOWED_HOSTS` | Sim | Hosts permitidos (separados por vírgula) |
| `FRONTEND_URL` | Sim | URL do frontend (CORS e e-mails) |
| `LEGAL_TERMS_VERSION` | Sim | Versão atual dos termos (ex: `2026-04-15`) |
| `DATABASE_URL` | Sim | URL PostgreSQL (`postgres://user:pass@host/db`) |
| `DB_CONN_MAX_AGE` | — | Tempo de conexão persistente em segundos (padrão: 60) |
| `CELERY_BROKER_URL` | Sim | URL Redis para o broker |
| `CELERY_RESULT_BACKEND` | Sim | URL Redis para resultados |
| `CERTIFICATE_ENCRYPTION_KEY` | Sim | Chave Fernet para cifrar certificados A1 |
| `R2_ACCESS_KEY_ID` | Sim | Access key do Cloudflare R2 |
| `R2_SECRET_ACCESS_KEY` | Sim | Secret key do Cloudflare R2 |
| `R2_ENDPOINT_URL` | Sim | Endpoint R2 (`https://<ID>.r2.cloudflarestorage.com`) |
| `R2_BUCKET_NAME` | Sim | Nome do bucket R2 |
| `R2_PUBLIC_DOMAIN` | Sim | Domínio público para URLs de download |
| `BREVO_API_KEY` | Sim | Chave da API Brevo para envio de e-mail |
| `BREVO_API_URL` | — | URL da API Brevo (padrão: endpoint SMTP) |
| `DEFAULT_FROM_EMAIL` | — | Remetente padrão dos e-mails |
| `SEFAZ_TIMEOUT` | — | Timeout das chamadas à SEFAZ em segundos (padrão: 30) |
| `SEFAZ_CA_BUNDLE_PATH` | — | Caminho para o bundle de certificados ICP-Brasil |
| `SENTRY_DSN` | — | DSN do Sentry para monitoramento de erros |
| `SECURE_SSL_REDIRECT` | — | `True` em produção para forçar HTTPS |
| `LOG_LEVEL_APPS` | — | Nível de log das apps (padrão: `INFO`) |

Para gerar uma `CERTIFICATE_ENCRYPTION_KEY` Fernet:
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## Deploy (Railway)

O projeto usa dois serviços Railway a partir da mesma imagem Docker:

| Serviço | Comando de início |
|---------|------------------|
| `DRF` (API) | `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 2 --timeout 120` |
| `Worker` | `celery -A config worker --loglevel=info --concurrency=1 --max-tasks-per-child=50` |

As migrações rodam automaticamente no pre-deploy do serviço `DRF` (`python manage.py migrate --noinput`).

### Criar primeiro superusuário via Railway SSH

Quando o `DATABASE_URL` usa host interno (ex.: `*.railway.internal`), `railway run` local pode falhar por DNS. Para criar o superusuário diretamente no container remoto:

1. Linkar o projeto ao Railway CLI:
   ```bash
   railway link
   ```

2. Abrir shell no container da API:
   ```bash
   railway ssh --service DRF
   ```

3. Dentro do container (`/app`), criar o superusuário:
   ```bash
   python manage.py createsuperuser --email admin@seu-dominio.com
   ```
   Ou sem prompt interativo de senha:
   ```bash
   export DJANGO_SUPERUSER_PASSWORD='SuaSenhaForteAqui'
   python manage.py createsuperuser --noinput --email admin@seu-dominio.com
   ```

> `task superuser` não funciona no container de produção porque o `taskipy` não é instalado (dependência de dev). Use `python manage.py createsuperuser` diretamente.

## Auditoria e LGPD

O sistema registra automaticamente mutações em dados pessoais e exportações em lote para conformidade com a LGPD (Art. 46 e 48). O Declaradata atua como **operador** — a empresa cliente é o controlador. Os logs permitem responder, em caso de incidente ou requisição de titular, quem alterou quais dados, quando e de onde.

### O que é registrado

| Evento | Modelo | Onde |
|--------|--------|------|
| Criar/editar/excluir Person | `PersonAuditLog` | `apps/persons/audit.py` |
| Upload/remoção de certificado A1 | `PersonAuditLog` | `apps/persons/audit.py` |
| Importação de pessoas via Excel | `PersonAuditLog` | `apps/persons/audit.py` |
| Exportação de lote XLSX de DC-e | `ShipmentExportLog` | `apps/shipments/audit.py` |
| Exportação de lote PDF de DC-e | `ShipmentExportLog` | `apps/shipments/audit.py` |
| Aceite de termos/privacidade | `UserConsentAudit` | `apps/users/models.py` |

Cada registro armazena: `actor_email` (denormalizado — persiste após deleção do usuário), `action`, `changed_fields` (diff antes/depois), `ip_address` e `timestamp`.

### O que não é registrado (decisão consciente)

- Leituras (GET) — sem valor jurídico para operador B2B, volume alto
- Downloads individuais de PDF/XML — já controlados por token assinado + JWT
- Emit/cancel de DC-e — rastreabilidade fiscal completa já existe via SEFAZ (`access_key`, `n_prot`, `dh_recbto`)

### Endpoints de consulta

Acessíveis apenas por `admin` da empresa ou `superadmin`:

```
GET /api/persons/audit-log/              — histórico de mutações em pessoas
GET /api/persons/audit-log/?person=<id>  — filtrar por pessoa específica
GET /api/persons/audit-log/?action=update — filtrar por tipo de ação
GET /api/shipments/export-log/           — histórico de exportações em lote
```

### Como manter ao adicionar novos módulos

Ao criar um novo app que trate dados pessoais (campos como nome, CPF, e-mail, endereço), siga este checklist:

1. **Criar `apps/<app>/audit.py`** com um modelo `<App>AuditLog` seguindo o padrão de `PersonAuditLog`: campos `company`, `actor`, `actor_email` (denormalizado), `action`, `changed_fields` (JSONField), `ip_address`, `timestamp`.

2. **Instrumentar o ViewSet** com um método `_audit()` privado e chamá-lo em:
   - `perform_create` → action `create`
   - `perform_update` → action `update`, com diff dos campos alterados
   - `perform_destroy` → action `delete`
   - Qualquer action customizada que mute dados pessoais

3. **Capturar IP** sempre via `get_client_ip(request)` de `apps.core.utils` — nunca inline.

4. **Expor endpoint de consulta** com `ReadOnlyModelViewSet`, permissão `IsSuperAdminOrCompanyManager`, filtro por empresa no `get_queryset()`.

5. **Gerar migração** (`makemigrations`) e garantir que o novo modelo está registrado no `apps.py` do app.

6. **Escrever testes** em `apps/<app>/tests/test_audit.py` cobrindo: criação gera log, edição gera log com `changed_fields`, viewer recebe 403 no endpoint de consulta.

### Retenção de logs

Não há purge automático implementado. Referência legal: Código Tributário Nacional recomenda 5 anos para documentos fiscais. Para purge futuro, criar um management command `purge_audit_logs --days=1825` e agendar via Railway Cron.

## Testes

```bash
poetry run task test
```

Usa pytest + pytest-django + factory-boy. O arquivo `conftest.py` na raiz configura o banco de teste e fixtures globais.

## Projetos Relacionados

- [`declaradata-web`](../web/) — interface web em Next.js
