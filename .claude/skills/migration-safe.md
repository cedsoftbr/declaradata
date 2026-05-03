# /migration-safe

Analisa migrations Django antes de aplicar em produção, identificando riscos de downtime, perda de dados ou inconsistência.

## Quando usar

Antes de rodar `migrate` em produção, ou ao revisar migrations geradas por `makemigrations`.

## O que fazer

### 1. Identificar as migrations pendentes

```bash
cd api && .venv/bin/python manage.py showmigrations --list | grep "\[ \]"
```

### 2. Ler cada migration pendente

Para cada arquivo de migration não aplicado, ler o conteúdo e classificar cada operação:

**Operações de alto risco (verificar antes de aplicar)**

| Operação | Risco | O que verificar |
|----------|-------|-----------------|
| `AddField` com `null=False` sem `default` | Bloqueia tabela populada | Existe `default` ou a tabela está vazia? |
| `RemoveField` | Perda de dados | O campo ainda é usado no código? |
| `RenameField` / `RenameModel` | Django gera como Remove+Add | Confirmar que é realmente Rename e não Remove |
| `AlterField` em coluna indexada | Lock na tabela | Tabela tem muitas linhas? |
| `RunSQL` | Qualquer coisa | Ler o SQL inteiro — é reversível? |
| `RunPython` | Qualquer coisa | A função é idempotente? |
| Mudança em `shipments_shipment` | Alta | Tabela maior do sistema, qualquer lock é crítico |
| Mudança em `companies_company` | Alta | Afeta todos os tenants |
| Mudança em `persons_person` | Média | Usada em todas as emissões |

**Operações seguras**
- `AddField` com `null=True` ou com `default` — não bloqueia
- `CreateModel` — tabela nova, sem risco
- `AddIndex` / `RemoveIndex` — pode ser lento mas não bloqueia escrita no Postgres moderno
- Mudanças em `Meta` (ordering, verbose_name) — sem impacto no banco

### 3. Verificar dependências de código

Se uma migration **remove** ou **renomeia** algo:
- Buscar usos no código: `grep -r "nome_do_campo" api/apps/`
- Confirmar que nenhum serializer, view, filter ou template ainda referencia o campo

### 4. Verificar reversibilidade

```bash
cd api && .venv/bin/python manage.py migrate <app> <migration_anterior> --plan
```

Se a migration não for reversível (ex: `RemoveField` sem `elidable`), documentar que o rollback exigirá restore de backup.

### 5. Reportar

Para cada migration pendente:

```
Migration: apps/<app>/migrations/<arquivo>.py
Operações: <lista>
Risco: ALTO / MÉDIO / BAIXO
Observação: <o que pode dar errado e como mitigar>
Reversível: Sim / Não
```

**Recomendação final:** seguro para aplicar em produção / requer janela de manutenção / requer ajuste antes de aplicar.

## Padrão para migrations arriscadas

Se detectar risco alto, sugerir a separação em duas migrations:

1. Primeira migration (deploy sem downtime): adicionar campo com `null=True`
2. Backfill dos dados existentes via `RunPython`  
3. Segunda migration (após backfill): `AlterField` para `null=False`
