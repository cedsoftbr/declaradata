# /tenant-safe

Revisa código novo ou modificado para garantir isolamento multi-tenant — nenhum dado de uma empresa deve ser acessível por usuário de outra empresa.

## Quando usar

Antes de commitar qualquer mudança em:
- `api/apps/*/views.py` — qualquer ViewSet novo ou modificado
- `api/apps/*/serializers.py` — serializers que retornam dados relacionados
- `api/apps/*/models.py` — models com FK para `companies.Company`
- `api/apps/*/tasks.py` — tasks Celery que processam dados por empresa
- Qualquer `get_queryset`, `perform_create`, `perform_update`, `perform_destroy` novo

## Regras de isolamento

### get_queryset — filtro obrigatório

Todo queryset de recurso tenant **deve** filtrar por `company_id` para não-superadmin:

```python
# Correto
def get_queryset(self):
    user = self.request.user
    if user.is_superadmin:
        return Modelo.objects.all()
    return Modelo.objects.filter(company_id=user.company_id)

# ERRADO — expõe dados de todas as empresas para usuários normais
def get_queryset(self):
    return Modelo.objects.all()
```

### perform_create — company injetada pelo servidor

A `company` nunca deve vir do corpo da requisição para usuários normais — deve ser injetada pelo servidor:

```python
# Correto
def perform_create(self, serializer):
    serializer.save(company_id=self.request.user.company_id)

# ERRADO — usuário pode passar company_id de outra empresa
def perform_create(self, serializer):
    serializer.save()
```

Superadmin pode receber `company` do body, mas deve ser validado explicitamente.

### has_object_permission — segunda linha de defesa

O `HasModulePermission` já verifica `obj.company_id == request.user.company_id` via `has_object_permission`. Mas se um ViewSet sobrescreve `get_permissions()` ou usa `permission_classes` customizado, verificar se essa proteção ainda está ativa.

### Serializers com recursos relacionados

Serializers que expõem FKs (ex: `person_id`, `product_id`) devem validar que o objeto referenciado pertence à empresa do usuário:

```python
# Verificar se existe validação do tipo:
def validate_person_id(self, value):
    company_id = self.context['request'].user.company_id
    if not Person.objects.filter(pk=value, company_id=company_id).exists():
        raise serializers.ValidationError('Pessoa não encontrada.')
    return value
```

### Tasks Celery

Tasks que recebem `company_id` como parâmetro devem usar esse filtro em todos os querysets internos — nunca ignorar o `company_id` passado:

```python
# Correto
def minha_task(ids, user_id, company_id):
    qs = Modelo.objects.filter(id__in=ids)
    if company_id:
        qs = qs.filter(company_id=company_id)

# ERRADO — ignora o company_id, processa dados de qualquer empresa
def minha_task(ids, user_id, company_id):
    qs = Modelo.objects.filter(id__in=ids)
```

### Endpoints de ação customizada (`@action`)

Actions como `emit`, `cancel`, `pdf`, `xml` devem verificar o isolamento **além** do `get_queryset`, pois podem receber IDs externos:

```python
# Verificar se o shipment/objeto buscado dentro da action filtra por company
shipment = Shipment.objects.filter(
    pk=pk,
    company_id=request.user.company_id  # obrigatório
).first()
```

## O que fazer

### 1. Mapear os arquivos modificados

Listar todos os ViewSets, serializers e tasks alterados.

### 2. Verificar cada get_queryset

Para cada `get_queryset`, confirmar:
- [ ] Superadmin → `objects.all()` ou sem filtro de company
- [ ] Usuário normal → sempre `filter(company_id=user.company_id)`
- [ ] Não usa `filter(company=user.company)` (FK object) onde `company_id` (inteiro/UUID) é mais eficiente

### 3. Verificar cada perform_create / perform_update

- [ ] `company_id` injetada pelo servidor, nunca do request body para usuários normais
- [ ] Superadmin: se aceitar `company` do body, garantir que existe validação explícita

### 4. Verificar serializers de FK

Para cada campo FK que aponta para recurso tenant (`person_id`, `product_id`, `series_id`, etc.):
- [ ] Existe `validate_<campo>` que filtra por `company_id`?
- [ ] Ou o queryset do campo é restrito por `company_id` via `queryset=...filter(company_id=...)`?

### 5. Rodar testes de multi-tenant

```bash
cd api && .venv/bin/pytest apps/shipments/tests/test_multitenant.py -v
```

Se existirem testes de multi-tenant em outros apps:
```bash
cd api && .venv/bin/pytest -k "multitenant or multi_tenant or tenant" -v
```

### 6. Verificar no frontend

No frontend, o isolamento é garantido pela API — mas checar se:
- Nenhuma query TanStack busca dados sem passar pelo BFF (`app/api/`)
- Nenhum componente usa `company_id` hardcoded ou vindo de localStorage

### 7. Reportar

Para cada ponto de vazamento encontrado:
```
Arquivo: apps/<app>/views.py:<linha>
Problema: get_queryset sem filtro de company_id
Impacto: usuário de Empresa A pode listar recursos da Empresa B via GET /api/<recurso>/
Correção: adicionar .filter(company_id=user.company_id) para não-superadmin
```

Resultado dos testes de multi-tenant.

Recomendação: **isolamento correto** / **vazamento identificado** (com correção específica).
