# Declaradata — Monorepo

Plataforma SaaS multi-tenant para emissão e gestão de DC-e integrada à SEFAZ-PR.

## Estrutura

```
api/   — Backend: Python 3.14, Django 5, DRF, Celery, PostgreSQL, Redis
web/   — Frontend: Next.js 16, React 19, TypeScript strict, Tailwind CSS 4, shadcn/ui
```

Instruções detalhadas de cada subprojeto:
- [api/CLAUDE.md](api/CLAUDE.md) — padrões da API Django
- [web/CLAUDE.md](web/CLAUDE.md) — padrões do frontend Next.js

## Contexto do Produto

DC-e (Documento de Conhecimento eletrônico) é um documento fiscal eletrônico para o modal rodoviário de cargas, autorizado pela SEFAZ-PR. O Declaradata gerencia o ciclo completo: criação → assinatura XMLDSig → autorização SEFAZ → cancelamento.

Cada empresa cliente é um tenant isolado (`company_id` em todas as queries). Usuários têm perfis fixos (`superadmin`, `admin`, `emissor`, `viewer`) com permissões granulares por módulo via roles.

## Ambientes SEFAZ

| Valor | Nome | Comportamento |
|-------|------|---------------|
| 1 | Produção | Envio real à SEFAZ-PR |
| 2 | Homologação | Ambiente de testes da SEFAZ |
| 3 | Simulado | Sem envio real — para testes locais |

## Regras Transversais

- PKs UUID v7 em todos os modelos Django.
- Sem `any` em TypeScript.
- Formulários sempre com React Hook Form + Zod.
- Processamento pesado (emissão, cancelamento, exportação) → Celery, nunca síncrono na view.
- Downloads de arquivos protegidos por token assinado com validade de 1 hora.
- Commits em português são aceitáveis; mensagens descrevem o WHY.
