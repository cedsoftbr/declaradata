# /component-review

Revisa componentes novos ou modificados no frontend, verificando consistência com os padrões do projeto antes de commitar.

## Quando usar

Antes de commitar qualquer arquivo `.tsx` novo ou modificado em:
- `features/*/components/`
- `components/` (exceto `components/ui/` — gerado pelo shadcn, não editar)

## O que verificar

### 1. Checar se já existe no shadcn

Antes de criar um componente customizado, verificar se o shadcn já tem:
- Usar o MCP: listar e buscar nos registries disponíveis
- Componentes já instalados em `components/ui/`: `alert`, `avatar`, `badge`, `breadcrumb`, `button`, `calendar`, `card`, `checkbox`, `dialog`, `dropdown-menu`, `field`, `form`, `input`, `label`, `native-select`, `pagination-controls`, `popover`, `progress`, `scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `sonner`, `switch`, `table`, `tabs`, `textarea`, `toggle`, `toggle-group`, `tooltip`, `date-range-picker`, `data-table`
- Se existir no shadcn mas não instalado, gerar o comando correto via MCP (`get_add_command_for_items`) respeitando o `components.json` do projeto (style: `base-nova`, aliases: `@/components/ui`)

### 2. TypeScript

- Sem `any` — `noExplicitAny: error` no Biome
- Props tipadas com `interface`, não `type` inline anônimo
- Sem `@ts-ignore` ou `@ts-expect-error` sem comentário explicando o motivo

### 3. Biome

- Sem `var` — usar `const`/`let`
- Sem array index key (`key={index}`) — usar id único do dado
- Sem variáveis declaradas e não usadas
- Template literals em vez de concatenação de string

### 4. Padrões de componente do projeto

- Estilização com `cn()` de `@/lib/utils` para combinar classes Tailwind condicionais
- Ícones: Lucide (`lucide-react`) — não instalar outras bibliotecas de ícones
- Toasts de feedback: `sonner` (`toast.success`, `toast.error`) — não usar `alert()`
- Loading states: `<Loader2 className="animate-spin" />` do Lucide
- Componentes `'use client'` apenas quando necessário (eventos, hooks, estado)

### 5. Acessibilidade mínima

- Inputs sempre com `Label` associado (via `htmlFor` ou envolvendo o input)
- Botões com `type="button"` quando dentro de `<form>` e não são submit — evita submit acidental
- Botões de ação destrutiva (remover, cancelar) com `variant="destructive"`

### 6. Rodar verificações

```bash
cd web && pnpm type-check && pnpm lint
```

### 7. Reportar

- Componentes shadcn disponíveis que poderiam substituir código customizado
- Violações de padrão encontradas com o trecho exato e a correção
- Resultado do type-check e lint
- Recomendação: **pronto para commitar** / **requer ajuste** (com o ajuste específico)
