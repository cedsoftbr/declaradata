# Declaradata — Web

Interface web do Declaradata, plataforma SaaS para emissão e gestão de DC-e (Documento de Conhecimento eletrônico).

## Stack

| Camada | Tecnologia |
|--------|------------|
| Framework | Next.js 16 (App Router) + React 19 |
| Linguagem | TypeScript 5 (strict) |
| Estilização | Tailwind CSS 4 |
| Componentes | Radix UI + shadcn/ui + Lucide Icons |
| Formulários | React Hook Form + Zod |
| Server state | TanStack Query v5 |
| Gráficos | Recharts |
| Linter/Formatter | Biome |
| Testes | Vitest + Testing Library (jsdom) |
| Deploy | Docker multi-stage + Railway |

## Arquitetura

```
app/
  (auth)/          — páginas públicas: login, set-password
  (dashboard)/     — páginas protegidas: dashboard, DCe, empresas, pessoas, produtos, usuários
  api/             — Route Handlers (proxy BFF para a API Django)
    auth/          — login, logout, refresh, password
    companies/     — repassa chamadas de empresas
    persons/       — repassa chamadas de pessoas (inclui certificado)
    shipments/     — repassa chamadas de DC-e
    products/      — repassa chamadas de produtos
    users/         — repassa chamadas de usuários
    locations/     — repassa chamadas de localidades
  termos/          — página de termos de uso
  privacidade/     — página de política de privacidade

components/        — componentes compartilhados (sidebar, formulários, charts, providers)
  ui/              — primitivos shadcn/ui

features/          — módulos de negócio (schema, componentes, API por domínio)
  companies/
  persons/
  products/
  shipments/
  users/
  locations/

hooks/             — hooks globais reutilizáveis
lib/               — cliente HTTP, utilitários, schemas Zod globais, helpers de documento
```

## Fluxo de Autenticação

O frontend **nunca armazena o refresh token no JavaScript** — ele trafega apenas em cookie `HttpOnly`. O access token (JWT) fica em memória e é renovado automaticamente pelo `useApi` hook via `/api/auth/refresh`.

O arquivo `proxy.ts` (middleware Next.js) intercepta todas as rotas protegidas, valida a assinatura do refresh token com `jose` e redireciona para `/auth/login` caso inválido ou ausente.

Os Route Handlers em `app/api/` funcionam como BFF: recebem a requisição do browser, adicionam o access token no header `Authorization` e repassam para a API Django via `API_INTERNAL_URL` (private network Railway), sem expor credenciais ao cliente.

## Módulos

| Feature | Páginas |
|---------|---------|
| Dashboard | Visão geral com gráfico de emissões diárias e top emitentes |
| DC-e | Listagem, criação, emissão, cancelamento, download PDF/XML, exportação Excel |
| Empresas | Cadastro, certificado digital da empresa, limites de uso |
| Pessoas | Cadastro, certificado A1 por emitente, configuração de séries de numeração |
| Produtos | Catálogo com NCM |
| Usuários | Gerenciamento de usuários e roles com permissões por módulo |
| Localidades | Países, estados, municípios (IBGE) |

## Desenvolvimento

### Pré-requisitos

- Node.js `>=20.19.0 <25`
- pnpm `10.33.0`

### Instalação

```bash
pnpm install
```

### Variáveis de Ambiente (desenvolvimento)

Crie um arquivo `.env.local` na raiz do `web/`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
JWT_SECRET=<mesmo valor de SECRET_KEY da API Django>
```

Em desenvolvimento, se `API_INTERNAL_URL` não estiver definido, o servidor Next.js faz proxy para `http://127.0.0.1:8000` automaticamente.

### Scripts

| Script | Descrição |
|--------|-----------|
| `pnpm dev` | Dev server (webpack, HMR) |
| `pnpm dev:turbo` | Dev server com Turbopack (experimental) |
| `pnpm build` | Build de produção |
| `pnpm start` | Inicia o servidor de produção |
| `pnpm test` | Roda testes em modo watch |
| `pnpm lint` | Biome check |
| `pnpm format` | Biome check com correção automática |
| `pnpm type-check` | Valida tipos TypeScript sem emitir arquivos |

### Multi-tenant em desenvolvimento

Para testar rotas com subdomínio diferente localmente use `*.lvh.me` (todos os subdomínios resolvem para `127.0.0.1`):

```
http://empresa.lvh.me:3000
```

O `next.config.ts` já libera esses origins para HMR.

## Testes

```bash
pnpm test        # watch
pnpm test --run  # CI / execução única
```

Cobertura gerada em `coverage/`. Excluídos por padrão: componentes base shadcn (`components/ui/`) e Route Handlers (`app/api/`).

Para gerar o relatório de cobertura:

```bash
pnpm vitest run --coverage
```

## Deploy (Railway)

O build usa Docker multi-stage: `deps` → `builder` → `runner` (imagem final enxuta com apenas produção).

### Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `NEXT_PUBLIC_API_URL` | Sim | URL pública da API Django (usada no browser) |
| `API_INTERNAL_URL` | Sim (prod) | URL interna da API Django via private network Railway — evita tráfego externo |
| `JWT_SECRET` | Sim | Segredo para validar o refresh token no middleware — deve ser o mesmo `SECRET_KEY` da API |

> Em produção, se `API_INTERNAL_URL` não estiver definido, o servidor lança erro na inicialização. Configure com o **private domain** do serviço `DRF` no Railway (ex.: `http://drf.railway.internal`).

### Health check

O Railway monitora `/auth/login` para confirmar que o container está saudável antes de promover o deploy.

## Projetos Relacionados

- [`declaradata-api`](../api/) — API REST em Django (backend)
