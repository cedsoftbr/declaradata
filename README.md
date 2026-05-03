# Declaradata

Plataforma SaaS para emissão e gestão de DC-e (Documento de Conhecimento eletrônico).

## Visão Geral

O Declaradata centraliza o ciclo de vida completo do DC-e: criação, assinatura digital XMLDSig com certificado A1, autorização pela SEFAZ, cancelamento e consulta de distribuição. Cada empresa (tenant) opera de forma completamente isolada. O processamento pesado é executado de forma assíncrona via Celery.

## Estrutura do Monorepo

```
declaradata/
  api/   — API REST (Django 5 + DRF + Celery)
  web/   — Interface web (Next.js 16 + React 19)
```

## Stack

| Camada | Tecnologia |
|--------|------------|
| Backend | Python 3.14, Django 5, Django REST Framework |
| Frontend | Next.js 16 (App Router), React 19, TypeScript strict |
| Banco | PostgreSQL |
| Fila | Celery + Redis |
| Estilização | Tailwind CSS 4, shadcn/ui |
| Assinatura XML | signxml (XMLDSig) |
| Storage | Cloudflare R2 |
| Auth | JWT (simplejwt) + refresh token em HttpOnly cookie + 2FA por e-mail (opcional) |
| Deploy | Docker + Railway |

## Autenticação

O login usa JWT com refresh token em cookie `HttpOnly`. O browser nunca chama a API Django diretamente — todas as requisições passam pelo BFF em Next.js (`app/api/`).

**2FA por e-mail (opcional):** perfis `admin`, `emissor` e `superadmin` podem habilitar autenticação em dois fatores via `PATCH /api/users/me/` com `{ twofa_enabled: true }`. Quando ativo, o login retorna `{ requires_2fa: true, session_token }` em vez do JWT, e o usuário é redirecionado para `/auth/2fa` para digitar o PIN de 6 dígitos enviado por e-mail. O PIN expira em 10 minutos e é invalidado após 5 tentativas erradas.

## Subprojetos

- [api/](api/) — API REST Django. Detalhes de endpoints, módulos, variáveis de ambiente e deploy em [api/README.md](api/README.md).
- [web/](web/) — Interface Next.js. Detalhes de arquitetura, autenticação BFF, scripts e deploy em [web/README.md](web/README.md).

## Ambiente de Desenvolvimento

### Pré-requisitos

- Python 3.14+, Poetry
- Node.js `>=20.19.0 <25`, pnpm `10.33.0`
- PostgreSQL e Redis em execução local

### API

```bash
cd api
poetry install
cp .env.example .env   # ajustar valores
poetry run task migrate
poetry run task dev    # inicia API + Celery worker em paralelo
```

### Web

```bash
cd web
pnpm install
# criar web/.env.local com NEXT_PUBLIC_API_URL e JWT_SECRET
pnpm dev
```

### Acessos locais

| Serviço | URL |
|---------|-----|
| API Django | http://localhost:8000 |
| Swagger UI | http://localhost:8000/api/docs/ |
| Web Next.js | http://localhost:3000 |

Para testar multi-tenant com subdomínio: `http://<slug>.lvh.me:3000` (todos os subdomínios `*.lvh.me` resolvem para `127.0.0.1`).

## Testes

```bash
# Backend
cd api && poetry run task test

# Frontend
cd web && pnpm test --run
```

## Deploy

Três serviços Railway a partir de imagens Docker independentes:

| Serviço | Diretório | Descrição |
|---------|-----------|-----------|
| `DRF` | `api/` | Gunicorn (2 workers). Migrações no pre-deploy. |
| `Worker` | `api/` | Celery worker (concurrency 1) |
| `Web` | `web/` | Next.js (Docker multi-stage) |

## Licença

Software proprietário — © 2024–2026 CEDSoft Informatica Ltda. Consulte [LICENSE](LICENSE).
