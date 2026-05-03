# Declaradata — Web

Interface Next.js 16 (App Router) para a plataforma SaaS de emissão e gestão de DC-e.

## Stack

- Next.js 16 + React 19, TypeScript 5 strict
- Tailwind CSS 4, shadcn/ui (Radix UI), Lucide Icons
- React Hook Form + Zod (formulários e validação)
- TanStack Query v5 (server state, cache, refetch)
- Recharts (gráficos do dashboard)
- jose (validação de JWT no middleware)
- Biome (lint + format), Vitest + Testing Library (testes)
- Docker multi-stage + Railway para deploy

## Estrutura

```
app/
  (auth)/            — páginas públicas: login, set-password
  (dashboard)/       — páginas protegidas (requer auth via middleware)
  api/               — Route Handlers BFF: proxy autenticado para a API Django
    auth/            — login, logout, refresh, password
    companies/       — empresas (inclui certificado)
    persons/         — pessoas (inclui certificado A1)
    shipments/       — DC-e
    products/
    users/
    locations/

components/          — componentes compartilhados e UI primitivos (shadcn)
features/            — módulos de negócio: schemas Zod, componentes, chamadas de API
  companies/
  persons/
  products/
  shipments/
  users/
  locations/
hooks/               — hooks globais reutilizáveis
lib/                 — cliente HTTP, utilitários, schemas Zod globais, helpers de documento
```

## Comandos

```bash
pnpm dev          # dev server (webpack)
pnpm build        # build de produção
pnpm test         # vitest watch
pnpm test --run   # vitest CI (execução única)
pnpm lint         # biome check
pnpm format       # biome check --write --unsafe
pnpm type-check   # tsc --noEmit
```

## Padrões de Código

### Geral
- Biome para lint e format. Aspas simples no JS/TS, aspas duplas no JSX. Sem ponto-e-vírgula. Indentação: 2 espaços. Linha máxima: 88.
- TypeScript strict — proibido `any` (`noExplicitAny: error` no Biome).
- Sem comentários óbvios — apenas quando o WHY não é evidente.
- Sem abstrações prematuras, sem features flags, sem backwards-compat hacks.
- Prefer `const`, template literals, sem `var`.

### Arquitetura BFF
- O browser **nunca** chama a API Django diretamente. Toda chamada passa pelos Route Handlers em `app/api/`.
- O Route Handler adiciona o `Authorization: Bearer <access_token>` e repassa para a API via `API_INTERNAL_URL` (private network Railway).
- O refresh token trafega apenas em cookie `HttpOnly` — nunca exposto ao JavaScript do browser.

### Autenticação
- Middleware em `proxy.ts` valida o refresh token com `jose` em toda rota não pública.
- Rotas públicas: `/auth/login`, `/auth/set-password`, `/login`.
- `useApi` hook gerencia o access token em memória e renova via `/api/auth/refresh` automaticamente.
- Ao receber 401, o hook tenta refresh uma vez antes de redirecionar para login.

### Formulários
- Sempre React Hook Form + Zod. Schema Zod define o tipo; `zodResolver` conecta ao form.
- Schemas de cada feature ficam em `features/<feature>/schemas.ts`.
- Schemas globais (person, company) ficam em `lib/schemas.ts` (barrel re-export das features).
- Campos opcionais com string vazia: usar `z.union([z.literal(''), z.string().<validação>()])`.
- Campos booleanos opcionais com default: `.optional().default(false)`.

### Queries (TanStack Query)
- Funções de fetch em `features/<feature>/api.ts` ou `lib/api.ts`.
- Keys de query: arrays com o nome do recurso e parâmetros, ex: `['shipments', filters]`.
- Mutações invalidam a query do recurso após sucesso.
- Usar `useApi` hook para chamadas autenticadas — ele injeta o token e gerencia refresh.

### Componentes
- Componentes de UI genéricos em `components/ui/` (não editar — gerados pelo shadcn).
- Componentes de feature em `features/<feature>/components/`.
- Componentes de layout/navegação em `components/`.
- Props tipadas com interface; nunca usar `any` em props.

### Validação de documentos
- CPF/CNPJ: funções em `lib/document.ts` (`validateCNPJ`, `formatCpfOrCnpj`, `isValidCpfOrCnpj`).
- `validateCNPJ` aceita CNPJ numérico (14 dígitos) ou alfanumérico — normaliza antes de validar.
- NCM: `normalizeNcm` (8 dígitos) e `formatNcm` também em `lib/document.ts`.

### Testes
- Vitest + Testing Library + jsdom.
- Arquivos de teste colocalizados com o que testam: `hooks/use-api.test.ts`, `features/shipments/schemas.test.ts`.
- Mockar apenas o que cruza fronteiras de sistema (fetch, APIs externas). Nunca mockar lógica interna.
- Componentes com state: envolver disparos de evento em `act()`.
- Excluídos da cobertura: `components/ui/` (shadcn) e `app/api/` (Route Handlers proxy).

## Variáveis de Ambiente

| Variável | Onde é usada | Descrição |
|----------|-------------|-----------|
| `NEXT_PUBLIC_API_URL` | Browser + fallback server | URL pública da API Django |
| `API_INTERNAL_URL` | Server-side (obrigatória em prod) | Private domain do serviço DRF no Railway |
| `JWT_SECRET` | Middleware (`proxy.ts`) | Mesmo valor que `SECRET_KEY` da API Django |

## Convenções de Arquivo

- Componentes: PascalCase (`PersonForm.tsx`)
- Hooks: camelCase com prefixo `use-` no nome do arquivo (`use-api.ts`)
- Schemas Zod: `schemas.ts` dentro da feature ou `lib/schemas.ts`
- Tipos exportados: sufixo `FormData` para tipos de formulário (`CompanyFormData`)
- Route Handlers: `app/api/<recurso>/route.ts`
