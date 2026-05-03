# /form-review

Revisa formulários do frontend garantindo que seguem o padrão RHF + Zod do projeto, com validação correta, tratamento de erros da API e tipos consistentes.

## Quando usar

Antes de commitar qualquer arquivo de formulário:
- `features/*/components/*-form.tsx`
- `features/*/schemas.ts`
- `lib/schemas.ts`

## O que verificar

### 1. Schema Zod

**Campos obrigatórios vs opcionais**
- Campo obrigatório: `z.string().min(1, 'Mensagem')` — nunca `z.string()` sem validação
- Campo opcional com string vazia aceita: `z.union([z.literal(''), z.string().<validação>()])` — **não** `.optional().or(z.literal(''))`  (ordem errada, causa falsos negativos)
- Campo opcional sem validação: `z.string().optional()`
- Campo booleano com default: `z.boolean().optional().default(false)` — nunca campo boolean obrigatório sem default quando o formulário pode não enviar o campo

**Campos de documento (CPF/CNPJ)**
- Usar `z.string().refine(validateCNPJ, 'CNPJ inválido')` para CNPJ
- `validateCNPJ` aceita string com ou sem pontuação (normaliza internamente via `normalizeDocument`)
- Para CPF/CNPJ genérico: `z.string().refine(isValidCpfOrCnpj, 'Documento inválido')`

**UUID de FK**
- `z.string().uuid()` para campos obrigatórios
- `z.string().uuid().nullable().optional()` para FK opcional (ex: `city_id`)

**Números de coerção**
- Campos numéricos de input HTML: `z.coerce.number()` — converte string para number automaticamente
- Com validação: `z.coerce.number().int('Inteiro').min(1, 'Mínimo 1')`

**Tipo exportado**
- Sempre exportar: `export type NomeFormData = z.infer<typeof nomeSchema>`

### 2. Componente de formulário

**Setup obrigatório**
```tsx
const { register, handleSubmit, control, formState: { errors } } = useForm<NomeFormData>({
  resolver: zodResolver(nomeSchema),
  defaultValues: { ... },
})
```

- `resolver: zodResolver(nomeSchema)` — obrigatório, sem isso a validação Zod não roda
- `defaultValues` sempre definido — evita campos uncontrolled/controlled misto
- Para campos complexos (select, switch, date): usar `<Controller>` em vez de `register`

**Exibição de erros**
- Erros do Zod: `{errors.campo && <p className="text-sm text-destructive">{errors.campo.message}</p>}`
- Ou via componente `<Field>` de `@/components/ui/field` se disponível

**Erros da API**
- Capturar no `catch` do submit e mapear para os campos com `setError` quando possível:
  ```tsx
  } catch (err) {
    toast.error(parseApiError(err))
  }
  ```
- `parseApiError` de `@/lib/utils` — achata objetos/arrays de erro da API Django em string legível
- Nunca exibir o objeto de erro bruto ao usuário

**Estado de loading**
- `useState<boolean>` local para `isSaving`/`isLoading` durante o submit
- Desabilitar o botão de submit enquanto salva: `disabled={isSaving || !isDirty}`
- `isDirty` do RHF evita submits desnecessários quando nada mudou

**Invalidação de cache após sucesso**
- Após criar/editar com sucesso: `queryClient.invalidateQueries({ queryKey: ['recurso'] })`
- Não navegar antes de invalidar — evita página stale

### 3. Campos específicos do projeto

**CEP com auto-preenchimento**
- Usar `useCepAutoFill` de `@/hooks/use-cep-autofill` — preenche endereço via ViaCEP automaticamente

**Telefone**
- Salvar limpo (só dígitos): `cleanPhone(value)` de `@/lib/utils` antes de enviar à API
- Exibir formatado: `formatPhone(value)` de `@/lib/utils`

**CPF/CNPJ**
- Salvar normalizado (só dígitos): `normalizeDocument(value)` de `@/lib/document`
- Exibir formatado: `formatCpfOrCnpj(value)` de `@/lib/document`

**NCM**
- Salvar normalizado: `normalizeNcm(value)` de `@/lib/document` (8 dígitos)
- Exibir formatado: `formatNcm(value)` de `@/lib/document`

### 4. Rodar verificações

```bash
cd web && pnpm type-check && pnpm lint && pnpm test --run
```

### 5. Reportar

- Violações de padrão Zod com o trecho exato e a correção
- Erros da API sem tratamento adequado
- Campos sem `defaultValues` definido
- Resultado do type-check, lint e testes
- Recomendação: **pronto para commitar** / **requer ajuste** (com o ajuste específico)
