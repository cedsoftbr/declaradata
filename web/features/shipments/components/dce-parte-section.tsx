'use client'

import { CheckCircle2, FilePlus2, Loader2, PencilLine } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { useApi } from '@/hooks/use-api'
import { useViaCep } from '@/hooks/use-viacep'
import type { City, Person } from '@/lib/api'
import { UF_LIST } from '@/lib/constants'
import { formatCpfOrCnpj, isValidCpfOrCnpj, normalizeDocument } from '@/lib/document'
import {
  cepKeyDown,
  cleanCep,
  cleanPhone,
  cn,
  formatCep,
  formatPhone,
} from '@/lib/utils'
import { inp, lbl, type ParteState, sel } from './dce-types'
import { PersonAutocomplete } from './person-autocomplete'

interface ParteSectionProps {
  id: string
  label: string
  required?: boolean
  value: ParteState
  onChange: (v: ParteState) => void
  persons: Person[]
  submitted?: boolean
  readOnly?: boolean
}

const mapPersonToParte = (found: Person): ParteState => ({
  person_id: found.id,
  person_address_id:
    found.addresses?.find(a => a.is_active && a.is_default)?.id ??
    found.addresses?.find(a => a.is_active)?.id ??
    null,
  document: formatCpfOrCnpj(found.document),
  name: found.name,
  zip_code: found.zip_code ?? '',
  address: found.address ?? '',
  number: found.number ?? '',
  complement: found.complement ?? '',
  neighborhood: found.neighborhood ?? '',
  contact_phone: found.contact_phone ?? '',
  uf: found.city?.uf ?? '',
  city_id: found.city?.id ?? null,
})

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Handles complex part logic with ViaCEP lookup and person selection
export function ParteSection({
  id,
  label,
  required = false,
  value,
  onChange,
  persons,
  submitted = false,
  readOnly = false,
}: ParteSectionProps) {
  const { call } = useApi()
  const { lookup: lookupViaCep, isLoading: isLoadingCep } = useViaCep()
  const [cities, setCities] = useState<City[]>([])
  const [loadingCities, setLoadingCities] = useState(false)
  const [lookingUpDoc, setLookingUpDoc] = useState(false)

  const normalizedDocument = useMemo(
    () => normalizeDocument(value.document),
    [value.document]
  )

  const foundPerson = useMemo(() => {
    if (
      !normalizedDocument ||
      (normalizedDocument.length !== 11 && normalizedDocument.length !== 14)
    )
      return null
    return (
      persons.find(p => normalizeDocument(p.document) === normalizedDocument) ?? null
    )
  }, [normalizedDocument, persons])

  const status = useMemo(() => {
    if (
      !normalizedDocument ||
      (normalizedDocument.length !== 11 && normalizedDocument.length !== 14)
    )
      return null
    if (!foundPerson) return 'novo'

    const original = mapPersonToParte(foundPerson)
    const fieldsToCompare: (keyof ParteState)[] = [
      'document',
      'name',
      'zip_code',
      'address',
      'number',
      'complement',
      'neighborhood',
      'contact_phone',
      'uf',
      'city_id',
    ]
    const isModified = fieldsToCompare.some(field => {
      const v1 = String(value[field] || '').trim()
      const v2 = String(original[field] || '').trim()
      return v1 !== v2
    })
    return isModified ? 'modificado' : 'cadastrado'
  }, [normalizedDocument, foundPerson, value])

  const set = (field: keyof ParteState) => (val: string) =>
    onChange({ ...value, [field]: val })

  const loadCities = useCallback(
    async (uf: string): Promise<City[]> => {
      if (!uf) {
        setCities([])
        return []
      }
      setLoadingCities(true)
      try {
        const res = await call(`/api/locations/cities/?uf=${uf}&page_size=1000`)
        const json = await res.json()
        const list: City[] = Array.isArray(json) ? json : json.results || []
        setCities(list)
        return list
      } catch {
        return []
      } finally {
        setLoadingCities(false)
      }
    },
    [call]
  )

  useEffect(() => {
    if (value.uf) loadCities(value.uf)
  }, [value.uf, loadCities])

  const handlePersonSelect = async (found: Person) => {
    const cityList = found.city ? await loadCities(found.city.uf) : []
    onChange(mapPersonToParte(found))
    if (found.city && cityList.length === 0) setCities([found.city])
  }

  const handleDocumentBlur = async (doc: string) => {
    const normalized = normalizeDocument(doc)
    if (normalized.length !== 11 && normalized.length !== 14) return

    setLookingUpDoc(true)
    try {
      if (foundPerson) {
        await handlePersonSelect(foundPerson)
      } else {
        onChange({
          ...value,
          document: doc,
          person_id: null,
          person_address_id: null,
        })
      }
    } finally {
      setLookingUpDoc(false)
    }
  }

  const handleCepBlur = async (raw: string) => {
    const data = await lookupViaCep(raw)
    if (!data) return

    const patch: Partial<ParteState> = {}
    if (data.logradouro) patch.address = data.logradouro
    if (data.bairro) patch.neighborhood = data.bairro

    if (data.uf) {
      patch.uf = data.uf
      patch.city_id = null
      const cityList = await loadCities(data.uf)
      const match = cityList.find(c => c.ibge_code === data.ibge)
      if (match) patch.city_id = match.id
    }

    onChange({ ...value, ...patch })
  }

  const hasDocument = normalizedDocument.length > 0
  const hasInvalidDocumentRealtime =
    hasDocument &&
    (normalizedDocument.length > 14 ||
      ([11, 14].includes(normalizedDocument.length) &&
        !isValidCpfOrCnpj(value.document)))
  const showRequiredDocumentError = submitted && !hasDocument
  const showInvalidDocumentError = hasInvalidDocumentRealtime

  return (
    <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </p>
        <div className="flex items-center gap-2">
          {status === 'cadastrado' && (
            <span className="flex items-center gap-1.5 text-green-600 text-[10px] font-bold uppercase tracking-wide">
              <CheckCircle2 className="size-3" /> Cadastrado
            </span>
          )}
          {status === 'modificado' && (
            <span className="flex items-center gap-1.5 text-amber-600 text-[10px] font-bold uppercase tracking-wide">
              <PencilLine className="size-3" /> Modificado
            </span>
          )}
          {status === 'novo' && (
            <span className="flex items-center gap-1.5 text-blue-600 text-[10px] font-bold uppercase tracking-wide">
              <FilePlus2 className="size-3" /> Novo
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[200px] space-y-1">
          <Label htmlFor={`${id}_name`} className={lbl}>
            Nome / Razão Social *
          </Label>
          <PersonAutocomplete
            id={`${id}_name`}
            value={value.name}
            onChange={val => set('name')(val)}
            onSelect={handlePersonSelect}
            className={inp}
            disabled={readOnly}
            aria-invalid={submitted && !value.name}
          />
          {submitted && !value.name && (
            <p className="text-[10px] text-destructive font-medium ml-1">
              Campo obrigatório
            </p>
          )}
        </div>

        <div className="w-[180px] space-y-1">
          <Label htmlFor={`${id}_doc`} className={lbl}>
            CPF / CNPJ *
          </Label>
          <div className="relative">
            <Input
              id={`${id}_doc`}
              disabled={readOnly}
              value={value.document}
              onChange={e => set('document')(formatCpfOrCnpj(e.target.value))}
              onBlur={e => handleDocumentBlur(e.target.value)}
              className={cn(inp, 'pr-7')}
              aria-invalid={showRequiredDocumentError || showInvalidDocumentError}
            />
            {lookingUpDoc && (
              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
          {showRequiredDocumentError && (
            <p className="text-[10px] text-destructive font-medium ml-1">
              Campo obrigatório
            </p>
          )}
          {showInvalidDocumentError && !showRequiredDocumentError && (
            <p className="text-[10px] text-destructive font-medium ml-1">
              Documento inválido (CPF ou CNPJ)
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <div className="w-[160px] space-y-1">
          <Label htmlFor={`${id}_phone`} className={lbl}>
            Telefone
          </Label>
          <Input
            id={`${id}_phone`}
            disabled={readOnly}
            value={formatPhone(value.contact_phone)}
            onChange={e => set('contact_phone')(cleanPhone(e.target.value))}
            className={inp}
          />
        </div>

        <div className="w-[120px] space-y-1">
          <Label htmlFor={`${id}_zip`} className={lbl}>
            CEP *
          </Label>
          <div className="relative">
            <Input
              id={`${id}_zip`}
              disabled={readOnly}
              inputMode="numeric"
              value={formatCep(value.zip_code)}
              onChange={e => set('zip_code')(cleanCep(e.target.value))}
              onKeyDown={cepKeyDown}
              onPaste={e => {
                e.preventDefault()
                set('zip_code')(cleanCep(e.clipboardData.getData('text')))
              }}
              onBlur={e => handleCepBlur(cleanCep(e.target.value))}
              className={cn(inp, 'pr-7')}
              aria-invalid={submitted && value.zip_code.length < 8}
            />
            {isLoadingCep && (
              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
          {submitted && value.zip_code.length < 8 && (
            <p className="text-[10px] text-destructive font-medium ml-1">
              {value.zip_code.length === 0 ? 'Campo obrigatório' : 'CEP inválido'}
            </p>
          )}
        </div>

        <div className="flex-1 min-w-[200px] space-y-1">
          <Label htmlFor={`${id}_address`} className={lbl}>
            Logradouro *
          </Label>
          <Input
            id={`${id}_address`}
            disabled={readOnly}
            value={value.address}
            onChange={e => set('address')(e.target.value)}
            className={inp}
            aria-invalid={submitted && !value.address}
          />
          {submitted && !value.address && (
            <p className="text-[10px] text-destructive font-medium ml-1">
              Campo obrigatório
            </p>
          )}
        </div>

        <div className="w-[80px] space-y-1">
          <Label htmlFor={`${id}_number`} className={lbl}>
            Número *
          </Label>
          <Input
            id={`${id}_number`}
            disabled={readOnly}
            value={value.number}
            onChange={e => set('number')(e.target.value)}
            className={inp}
            aria-invalid={submitted && !value.number}
          />
          {submitted && !value.number && (
            <p className="text-[10px] text-destructive font-medium ml-1">
              Campo obrigatório
            </p>
          )}
        </div>

        <div className="w-[150px] space-y-1">
          <Label htmlFor={`${id}_complement`} className={lbl}>
            Complemento
          </Label>
          <Input
            id={`${id}_complement`}
            disabled={readOnly}
            value={value.complement}
            onChange={e => set('complement')(e.target.value)}
            className={inp}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <div className="w-[180px] space-y-1">
          <Label htmlFor={`${id}_neighborhood`} className={lbl}>
            Bairro *
          </Label>
          <Input
            id={`${id}_neighborhood`}
            disabled={readOnly}
            value={value.neighborhood}
            onChange={e => set('neighborhood')(e.target.value)}
            className={inp}
            aria-invalid={submitted && !value.neighborhood}
          />
          {submitted && !value.neighborhood && (
            <p className="text-[10px] text-destructive font-medium ml-1">
              Campo obrigatório
            </p>
          )}
        </div>

        <div className="w-[80px] space-y-1">
          <Label htmlFor={`${id}_uf`} className={lbl}>
            UF *
          </Label>
          <NativeSelect
            id={`${id}_uf`}
            value={value.uf}
            onChange={e => {
              onChange({ ...value, uf: e.target.value, city_id: null })
              loadCities(e.target.value)
            }}
            disabled={readOnly}
            className={sel}
            aria-invalid={submitted && !value.uf}
          >
            <NativeSelectOption value="">UF</NativeSelectOption>
            {UF_LIST.map(uf => (
              <NativeSelectOption key={uf} value={uf}>
                {uf}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {submitted && !value.uf && (
            <p className="text-[10px] text-destructive font-medium ml-1">
              Campo obrigatório
            </p>
          )}
        </div>

        <div className="w-full md:w-[280px] space-y-1">
          <Label htmlFor={`${id}_city`} className={lbl}>
            Cidade *
          </Label>
          <NativeSelect
            id={`${id}_city`}
            value={value.city_id ?? ''}
            onChange={e =>
              onChange({
                ...value,
                city_id: e.target.value || null,
              })
            }
            disabled={readOnly || !value.uf || loadingCities}
            className={sel}
            aria-invalid={submitted && !value.city_id}
          >
            <NativeSelectOption value="">
              {loadingCities
                ? 'Carregando...'
                : !value.uf
                  ? 'Selecione a UF'
                  : 'Selecione a cidade'}
            </NativeSelectOption>
            {cities.map(c => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {submitted && !value.city_id && (
            <p className="text-[10px] text-destructive font-medium ml-1">
              Campo obrigatório
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
