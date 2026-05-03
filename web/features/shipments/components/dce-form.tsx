'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileStack, Loader2, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useApi } from '@/hooks/use-api'
import { type Person, personsApi } from '@/lib/api'
import {
  formatCpfOrCnpj,
  formatNcm,
  isValidCpfOrCnpj,
  normalizeDocument,
} from '@/lib/document'
import { cn, parseApiError } from '@/lib/utils'
import { companiesApi } from '../../companies/api'
import { productsApi } from '../../products/api'
import type { ShipmentDetail } from '../api'
import { shipmentsApi } from '../api'
import { CancelShipmentDialog } from './cancel-shipment-dialog'
import { CarrierSection } from './dce-carrier-section'
import { ItemsList } from './dce-items-list'
import { ParteSection } from './dce-parte-section'
import {
  type ItemState,
  inp,
  lbl,
  newItem,
  PARTE_EMPTY,
  type ParteState,
  sel,
} from './dce-types'

interface DceFormProps {
  initialData?: ShipmentDetail
  readOnly?: boolean
}

type ShipmentSnapshot = {
  city_uf?: string
  city_id?: string
}

type LegacyParteSource = Partial<Person> & {
  phone?: string
  uf?: string
  city_id?: string | null
  city?: {
    id?: string
    uf?: string
  } | null
  addresses?: Array<{
    id?: string
    contact_phone?: string
    contact_email?: string
    zip_code?: string
    address?: string
    number?: string
    complement?: string
    neighborhood?: string
    city?: {
      id?: string
      uf?: string
    } | null
    is_default?: boolean
    is_active?: boolean
  }>
}

function resolveLegacyAddress(
  source: LegacyParteSource | null,
  preferredAddressId?: string | null
) {
  if (!source) return null
  const addresses = source.addresses ?? []
  return (
    addresses.find(a => a.id === preferredAddressId) ||
    addresses.find(a => a.is_active && a.is_default) ||
    addresses.find(a => a.is_active) ||
    null
  )
}

export function mapEmitterToSenderParte(emitter: Person): ParteState {
  const defaultAddress =
    emitter.addresses?.find(a => a.is_active && a.is_default) ||
    emitter.addresses?.find(a => a.is_active) ||
    null

  return {
    person_id: emitter.id,
    person_address_id: defaultAddress?.id ?? null,
    document: formatCpfOrCnpj(emitter.document || ''),
    name: emitter.name || '',
    zip_code: emitter.zip_code || defaultAddress?.zip_code || '',
    address: emitter.address || defaultAddress?.address || '',
    number: emitter.number || defaultAddress?.number || '',
    complement: emitter.complement || defaultAddress?.complement || '',
    neighborhood: emitter.neighborhood || defaultAddress?.neighborhood || '',
    contact_phone: emitter.contact_phone || defaultAddress?.contact_phone || '',
    uf: emitter.city?.uf || defaultAddress?.city?.uf || '',
    city_id: emitter.city?.id || defaultAddress?.city?.id || null,
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Handles complex form logic for DC-e emission
export function DceForm({ initialData, readOnly = false }: DceFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { accessToken: token, user } = useAuth()
  const { call } = useApi()

  // Carregar perfil da empresa para obter o ambiente atual
  const companyId = user?.company_id
  const { data: company } = useQuery({
    queryKey: ['company', companyId],
    queryFn: () => companiesApi.get(token ?? '', companyId ?? ''),
    enabled: !!token && !!companyId,
    staleTime: 5 * 60 * 1000,
  })

  const [emitterId, setEmitterId] = useState<string>(
    (initialData as unknown as { emitter?: string })?.emitter ?? ''
  )

  const { data: emitterCertStatus } = useQuery({
    queryKey: ['person-certificate-status', emitterId],
    queryFn: async () => {
      const res = await call(`/api/persons/${emitterId}/certificate/status/`)
      if (!res.ok) return null
      return (await res.json()) as { has_certificate: boolean }
    },
    enabled: !!token && !!emitterId,
    staleTime: 60 * 1000,
  })

  const allowSimulated = company?.allow_simulated_environment_for_emitters ?? true

  const ambientDisplay: 1 | 2 | 3 = useMemo(() => {
    if (initialData?.tp_amb) return initialData.tp_amb
    if (emitterCertStatus?.has_certificate) {
      return (company?.environment ?? 2) as 1 | 2 | 3
    }
    return allowSimulated ? 3 : 2
  }, [
    initialData?.tp_amb,
    emitterCertStatus?.has_certificate,
    company?.environment,
    allowSimulated,
  ])

  const [shipmentId] = useState(initialData?.id || '')
  const [isSaving, setIsSaving] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const { data: usageData } = useQuery({
    queryKey: ['shipments-usage'],
    queryFn: async () => {
      const res = await call('/api/shipments/usage/')
      if (!res.ok) return null
      return res.json() as Promise<{ count: number; limit: number; period: string }>
    },
    enabled: !!token,
    refetchInterval: 30000,
  })
  const isUsageLimitReached = (usageData?.count ?? 0) >= (usageData?.limit ?? Infinity)
  const shouldBlockNewByLimit = !shipmentId && isUsageLimitReached

  // Busca de Emitentes com Cache
  const { data: emittersData, isLoading: isLoadingEmitters } = useQuery({
    queryKey: ['emitters', token, allowSimulated],
    queryFn: () =>
      personsApi.list(token ?? '', {
        is_emitente: true,
        is_active: true,
        page_size: 200,
        ...(!allowSimulated ? { has_certificate: true } : {}),
      }),
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 minutos de cache
  })
  const emitters = emittersData?.results ?? []
  const selectedEmitter = useMemo(
    () => emitters.find(e => e.id === emitterId) ?? null,
    [emitters, emitterId]
  )
  const isCarrierLockedByEmitter = selectedEmitter?.tp_emit === 3
  const isSenderLockedByEmitter = selectedEmitter?.tp_emit === 2

  // Busca de Pessoas (Clientes/Remetentes) com Cache
  const { data: personsData, isLoading: isLoadingPersons } = useQuery({
    queryKey: ['persons-all', token],
    queryFn: () => personsApi.list(token ?? '', { is_active: true, page_size: 1000 }),
    enabled: !!token && !readOnly,
    staleTime: 5 * 60 * 1000,
  })
  const persons = personsData?.results ?? []

  // Seleção automática se houver apenas um emitente
  useEffect(() => {
    if (!readOnly && !emitterId && emitters.length === 1) {
      setEmitterId(emitters[0].id)
    }
  }, [emitters, emitterId, readOnly])

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Handles complex ParteState calculation
  const [remetente, setRemetente] = useState<ParteState>(() => {
    const s = (initialData?.sender_snapshot ||
      initialData?.sender_detail) as LegacyParteSource | null
    const selectedSenderAddressId =
      (initialData as unknown as { sender_address?: string })?.sender_address || null
    const addr = resolveLegacyAddress(s, selectedSenderAddressId)
    if (!s) return PARTE_EMPTY

    // Se vier do snapshot (ex: dace autorizado), os campos são city_uf e city_name
    const snapshot = initialData?.sender_snapshot
    return {
      person_id: initialData?.sender || null,
      person_address_id: selectedSenderAddressId || addr?.id || null,
      document: formatCpfOrCnpj(s.document || ''),
      name: s.name || '',
      zip_code: s.zip_code || addr?.zip_code || '',
      address: s.address || addr?.address || '',
      number: s.number || addr?.number || '',
      complement: s.complement || addr?.complement || '',
      neighborhood: s.neighborhood || addr?.neighborhood || '',
      contact_phone: s.contact_phone || s.phone || addr?.contact_phone || '',
      uf:
        (snapshot as ShipmentSnapshot)?.city_uf ||
        s.uf ||
        (s.city?.uf ?? '') ||
        (addr?.city?.uf ?? ''),
      city_id:
        (snapshot as ShipmentSnapshot)?.city_id ||
        s.city_id ||
        (s.city?.id ?? null) ||
        (addr?.city?.id ?? null) ||
        initialData?.sender_detail?.city?.id ||
        ((initialData?.sender_detail as unknown as { city_id?: string })?.city_id ??
          null),
    }
  })

  useEffect(() => {
    if (readOnly || !isSenderLockedByEmitter || !selectedEmitter) return
    setRemetente(prev => {
      const next = mapEmitterToSenderParte(selectedEmitter)
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next
    })
  }, [readOnly, isSenderLockedByEmitter, selectedEmitter])

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Handles complex ParteState calculation
  const [destinatario, setDestinatario] = useState<ParteState>(() => {
    const r = (initialData?.recipient_snapshot ||
      initialData?.recipient_detail) as LegacyParteSource | null
    const selectedRecipientAddressId =
      (initialData as unknown as { recipient_address?: string })?.recipient_address ||
      null
    const addr = resolveLegacyAddress(r, selectedRecipientAddressId)
    if (!r) return PARTE_EMPTY

    const snapshot = initialData?.recipient_snapshot
    return {
      person_id: initialData?.recipient || null,
      person_address_id: selectedRecipientAddressId || addr?.id || null,
      document: formatCpfOrCnpj(r.document || ''),
      name: r.name || '',
      zip_code: r.zip_code || addr?.zip_code || '',
      address: r.address || addr?.address || '',
      number: r.number || addr?.number || '',
      complement: r.complement || addr?.complement || '',
      neighborhood: r.neighborhood || addr?.neighborhood || '',
      contact_phone: r.contact_phone || r.phone || addr?.contact_phone || '',
      uf:
        (snapshot as ShipmentSnapshot)?.city_uf ||
        r.uf ||
        (r.city?.uf ?? '') ||
        (addr?.city?.uf ?? ''),
      city_id:
        (snapshot as ShipmentSnapshot)?.city_id ||
        r.city_id ||
        (r.city?.id ?? null) ||
        (addr?.city?.id ?? null) ||
        initialData?.recipient_detail?.city?.id ||
        ((initialData?.recipient_detail as unknown as { city_id?: string })?.city_id ??
          null),
    }
  })

  const [tpTransp, setTpTransp] = useState<number>(initialData?.tp_transp ?? 2)
  const [carrierId, setCarrierId] = useState<string>(initialData?.carrier || '')
  const [carrierName, setCarrierName] = useState<string>(() => {
    const tp = initialData?.tp_transp ?? 2
    if (tp === 0) return 'Correios'
    if (tp === 1) return 'Próprio'
    if (initialData?.carrier_snapshot?.name) return initialData.carrier_snapshot.name
    if (initialData?.carrier_detail?.name) return initialData.carrier_detail.name
    return ''
  })
  useEffect(() => {
    if (readOnly || !isCarrierLockedByEmitter || !selectedEmitter) return
    if (carrierId !== selectedEmitter.id) setCarrierId(selectedEmitter.id)
    if (carrierName !== selectedEmitter.name) setCarrierName(selectedEmitter.name)
    if (tpTransp !== 2) setTpTransp(2)
  }, [
    readOnly,
    isCarrierLockedByEmitter,
    selectedEmitter,
    carrierId,
    carrierName,
    tpTransp,
  ])
  const [transportMode, setTransportMode] = useState<number>(
    initialData?.transport_mode || 1
  )
  const [infoComplementar, setInfoComplementar] = useState(
    initialData?.info_complementar || ''
  )
  const [itens, setItens] = useState<ItemState[]>(() => {
    if (!initialData?.items?.length) return [newItem()]
    return initialData.items.map(it => ({
      id: it.id,
      product_id: it.product_id,
      x_prod: it.x_prod,
      ncm: formatNcm(it.ncm),
      q_com: it.q_com,
      v_un_com: it.v_un_com,
    }))
  })

  const initialSnapshot = useMemo(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex snapshot for dirty checking
    () =>
      JSON.stringify({
        remetente: {
          ...PARTE_EMPTY,
          ...(initialData?.sender_snapshot
            ? {
                person_id: initialData?.sender || null,
                person_address_id:
                  (initialData as unknown as { sender_address?: string })
                    ?.sender_address || null,
                document: formatCpfOrCnpj(initialData.sender_snapshot.document || ''),
                name: initialData.sender_snapshot.name || '',
                zip_code: initialData.sender_snapshot.zip_code || '',
                address: initialData.sender_snapshot.address || '',
                number: initialData.sender_snapshot.number || '',
                complement: initialData.sender_snapshot.complement || '',
                neighborhood: initialData.sender_snapshot.neighborhood || '',
                contact_phone: initialData.sender_snapshot.phone || '',
                uf: initialData.sender_snapshot.city_uf || '',
                city_id:
                  initialData.sender_detail?.city?.id ||
                  (initialData.sender_detail as unknown as { city_id?: string })
                    ?.city_id ||
                  null,
              }
            : {}),
        },
        destinatario: {
          ...PARTE_EMPTY,
          ...(initialData?.recipient_snapshot
            ? {
                person_id: initialData?.recipient || null,
                person_address_id:
                  (initialData as unknown as { recipient_address?: string })
                    ?.recipient_address || null,
                document: formatCpfOrCnpj(
                  initialData.recipient_snapshot.document || ''
                ),
                name: initialData.recipient_snapshot.name || '',
                zip_code: initialData.recipient_snapshot.zip_code || '',
                address: initialData.recipient_snapshot.address || '',
                number: initialData.recipient_snapshot.number || '',
                complement: initialData.recipient_snapshot.complement || '',
                neighborhood: initialData.recipient_snapshot.neighborhood || '',
                contact_phone: initialData.recipient_snapshot.phone || '',
                uf: initialData.recipient_snapshot.city_uf || '',
                city_id:
                  initialData.recipient_detail?.city?.id ||
                  (initialData.recipient_detail as unknown as { city_id?: string })
                    ?.city_id ||
                  null,
              }
            : {}),
        },
        tpTransp: initialData?.tp_transp ?? 2,
        carrierId: initialData?.carrier || '',
        carrierName: (() => {
          const tp = initialData?.tp_transp ?? 2
          if (tp === 0) return 'Correios'
          if (tp === 1) return 'Próprio'
          return (
            initialData?.carrier_snapshot?.name ||
            initialData?.carrier_detail?.name ||
            ''
          )
        })(),
        transportMode: initialData?.transport_mode || 1,
        infoComplementar: initialData?.info_complementar || '',
        itens: initialData?.items?.map(it => ({
          product_id: it.product_id,
          x_prod: it.x_prod,
          ncm: formatNcm(it.ncm),
          q_com: it.q_com,
          v_un_com: it.v_un_com,
        })) || [{ ...newItem(), id: '' }],
      }),
    [initialData]
  )

  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        remetente,
        destinatario,
        tpTransp,
        carrierId,
        carrierName,
        transportMode,
        infoComplementar,
        itens: itens.map(it => ({
          product_id: it.product_id,
          x_prod: it.x_prod,
          ncm: it.ncm,
          q_com: it.q_com,
          v_un_com: it.v_un_com,
        })),
      }),
    [
      remetente,
      destinatario,
      tpTransp,
      carrierId,
      carrierName,
      transportMode,
      infoComplementar,
      itens,
    ]
  )

  const isDirty = currentSnapshot !== initialSnapshot

  const addItem = () => setItens(p => [...p, newItem()])
  const removeItem = (idx: number) => setItens(p => p.filter((_, i) => i !== idx))
  const updateItem = (idx: number, updates: Partial<ItemState>) =>
    setItens(p => p.map((it, i) => (i === idx ? { ...it, ...updates } : it)))

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: handle complex person and address creation logic
  async function saveParte(
    parte: ParteState
  ): Promise<{ personId: string | null; addressId: string | null }> {
    const docDigits = normalizeDocument(parte.document)
    if (!docDigits) {
      return { personId: null, addressId: null }
    }
    if (!parte.name.trim()) throw new Error('Nome obrigatório')
    if (!parte.zip_code.trim()) throw new Error('CEP obrigatório')
    if (!parte.address.trim()) throw new Error('Logradouro obrigatório')
    if (!parte.number.trim()) throw new Error('Número obrigatório')
    if (!parte.neighborhood.trim()) throw new Error('Bairro obrigatório')
    if (!parte.uf.trim()) throw new Error('UF obrigatória')
    if (!parte.city_id) throw new Error('Cidade obrigatória')

    // Tenta encontrar a pessoa na lista local pelo documento se não tiver ID
    const existingPerson = persons.find(
      p => normalizeDocument(p.document) === docDigits
    )
    const personIdToUse = parte.person_id || existingPerson?.id

    const personPayload: Record<string, unknown> = {
      document: parte.document,
      name: parte.name,
      is_active: true,
    }
    // Se for criação total, marca que não é transportador por padrão (DCE partes)
    if (!personIdToUse) personPayload.is_carrier = false

    const personUrl = personIdToUse ? `/api/persons/${personIdToUse}/` : '/api/persons/'

    const personRes = await call(personUrl, {
      method: personIdToUse ? 'PATCH' : 'POST',
      body: JSON.stringify(personPayload),
    })

    if (!personRes.ok) {
      const err = await personRes.json().catch(() => ({}))
      throw new Error(parseApiError(err) || 'Erro ao salvar pessoa')
    }
    const savedPerson = (await personRes.json()) as Person
    const personId = savedPerson.id

    // Agora resolve o endereço
    const knownPerson =
      persons.find(p => p.id === personId) ||
      persons.find(p => normalizeDocument(p.document) === docDigits) ||
      savedPerson

    const baseAddress =
      knownPerson?.addresses?.find(a => a.id === parte.person_address_id) ||
      knownPerson?.addresses?.find(a => a.is_active && a.is_default) ||
      knownPerson?.addresses?.find(a => a.is_active) ||
      null

    const addressPayload = {
      label: baseAddress?.label || 'Principal',
      contact_phone: parte.contact_phone,
      contact_email: baseAddress?.contact_email || '',
      zip_code: parte.zip_code,
      address: parte.address,
      number: parte.number,
      complement: parte.complement,
      neighborhood: parte.neighborhood,
      city_id: parte.city_id,
      is_default: true,
      is_active: true,
    }

    const addressRes = await call(`/api/persons/${personId}/addresses/`, {
      method: 'POST',
      body: JSON.stringify(addressPayload),
    })

    if (!addressRes.ok) {
      const err = await addressRes.json().catch(() => ({}))
      throw new Error(parseApiError(err) || 'Erro ao salvar endereço')
    }
    const savedAddress = await addressRes.json()
    return { personId, addressId: savedAddress.id || null }
  }

  const saveItem = async (item: ItemState): Promise<ItemState> => {
    if (item.product_id) return item
    if (!item.x_prod.trim() || item.ncm.replace(/\D/g, '').length !== 8) return item
    try {
      const saved = await productsApi.create(token ?? '', {
        descricao: item.x_prod.trim(),
        ncm: item.ncm.replace(/\D/g, ''),
      })
      const updated = { ...item, product_id: saved.id }
      // Atualiza o product_id no estado para evitar duplicatas se emitir novamente
      setItens(prev => prev.map(it => (it.id === item.id ? updated : it)))
      return updated
    } catch {
      // Produto pode já existir no catálogo — ignorar silenciosamente
      return item
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex validation logic for multiple form sections
  const validate = () => {
    setSubmitted(true)
    const errors: string[] = []

    if (!emitterId) {
      errors.push('O emitente é obrigatório')
    }

    if (!normalizeDocument(destinatario.document)) {
      errors.push('Documento do destinatário é obrigatório')
    } else if (!isValidCpfOrCnpj(destinatario.document)) {
      errors.push('Documento do destinatário é inválido')
    }
    if (!destinatario.name.trim()) {
      errors.push('Nome do destinatário é obrigatório')
    }
    if (!destinatario.address.trim()) {
      errors.push('Endereço do destinatário é obrigatório')
    }
    if (!destinatario.number.trim()) {
      errors.push('Número do destinatário é obrigatório')
    }
    if (!destinatario.neighborhood.trim()) {
      errors.push('Bairro do destinatário é obrigatório')
    }
    if (!destinatario.uf.trim()) {
      errors.push('UF do destinatário é obrigatória')
    }
    if (!destinatario.city_id) {
      errors.push('Cidade do destinatário é obrigatória')
    }
    if (destinatario.zip_code.length < 8) {
      errors.push('CEP do destinatário é obrigatório')
    }

    const senderHasAnyData = Boolean(
      normalizeDocument(remetente.document) ||
        remetente.name.trim() ||
        remetente.zip_code.trim() ||
        remetente.address.trim() ||
        remetente.number.trim() ||
        remetente.neighborhood.trim() ||
        remetente.uf.trim() ||
        remetente.city_id
    )
    if (senderHasAnyData) {
      if (!normalizeDocument(remetente.document)) {
        errors.push('Documento do remetente é obrigatório')
      } else if (!isValidCpfOrCnpj(remetente.document)) {
        errors.push('Documento do remetente é inválido')
      }
      if (!remetente.name.trim()) {
        errors.push('Nome do remetente é obrigatório')
      }
      if (!remetente.address.trim()) {
        errors.push('Endereço do remetente é obrigatório')
      }
      if (!remetente.number.trim()) {
        errors.push('Número do remetente é obrigatório')
      }
      if (!remetente.neighborhood.trim()) {
        errors.push('Bairro do remetente é obrigatório')
      }
      if (!remetente.uf.trim()) {
        errors.push('UF do remetente é obrigatória')
      }
      if (!remetente.city_id) {
        errors.push('Cidade do remetente é obrigatória')
      }
      if (remetente.zip_code.length < 8) {
        errors.push('CEP do remetente é obrigatório')
      }
    }

    if ((tpTransp === 2 || isCarrierLockedByEmitter) && !carrierId) {
      errors.push('O transportador é obrigatório')
    }

    if (itens.length === 0) {
      errors.push('Adicione pelo menos um item')
    }

    for (const [idx, it] of itens.entries()) {
      const n = idx + 1
      if (!it.x_prod.trim()) errors.push(`Descrição do item ${n} é obrigatória`)
      if (!it.ncm.trim()) errors.push(`NCM do item ${n} é obrigatório`)
      else if (it.ncm.replace(/\D/g, '').length !== 8)
        errors.push(`NCM do item ${n} deve ter 8 dígitos`)
      if (!it.q_com || parseFloat(it.q_com) <= 0)
        errors.push(`Quantidade do item ${n} deve ser maior que zero`)
      if (!it.v_un_com || parseFloat(it.v_un_com) <= 0)
        errors.push(`Valor unitário do item ${n} deve ser maior que zero`)
    }

    if (errors.length > 0) {
      toast.error('Não foi possível salvar', {
        description:
          'Existem campos obrigatórios ou inválidos que precisam de sua atenção.',
      })
      return false
    }
    return true
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: handles the full save process including side effects
  const handleSave = async () => {
    if (readOnly) return
    if (shouldBlockNewByLimit) {
      toast.error('Limite mensal atingido. Não é possível criar nova emissão.')
      return
    }
    if (!validate()) return
    setIsSaving(true)
    try {
      const [senderSaved, recipientSaved] = await Promise.all([
        saveParte(remetente).catch((e: Error) => {
          throw new Error(`Remetente: ${e.message}`)
        }),
        saveParte(destinatario).catch((e: Error) => {
          throw new Error(`Destinatário: ${e.message}`)
        }),
      ])

      if (!recipientSaved?.personId) throw new Error('Destinatário não salvo.')
      if (!token) throw new Error('Sessão expirada.')

      const resolvedItens = await Promise.all(itens.map(saveItem))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['persons'] }),
      ])

      // IDs dos itens que vieram do banco (para o diff de update)
      const originalItemIds = new Set((initialData?.items ?? []).map(it => it.id))

      const shouldSendCarrier = tpTransp === 2 || isCarrierLockedByEmitter
      const payload = {
        emitter_id: emitterId || null,
        sender_id: senderSaved?.personId ?? null,
        sender_address_id: senderSaved?.addressId ?? null,
        recipient_id: recipientSaved.personId,
        recipient_address_id: recipientSaved.addressId ?? null,
        tp_transp: tpTransp,
        carrier_id: shouldSendCarrier ? carrierId || null : null,
        carrier_address_id: shouldSendCarrier
          ? persons
              .find(p => p.id === carrierId)
              ?.addresses?.find(a => a.is_active && a.is_default)?.id || null
          : null,
        transport_mode: transportMode,
        tp_amb: ambientDisplay,
        info_complementar: infoComplementar?.trim() || '',
        items: resolvedItens.map(it => ({
          ...(shipmentId && originalItemIds.has(it.id) ? { id: it.id } : {}),
          product_id: it.product_id,
          x_prod: it.x_prod,
          ncm: it.ncm.replace(/\D/g, ''),
          q_com: parseFloat(it.q_com),
          v_un_com: parseFloat(it.v_un_com),
        })),
      }

      if (shipmentId) {
        await shipmentsApi.update(token, shipmentId, payload)
        await queryClient.invalidateQueries({ queryKey: ['shipment', shipmentId] })
      } else {
        await shipmentsApi.create(token, payload)
      }

      await queryClient.invalidateQueries({ queryKey: ['shipments'] })
      toast.success(
        shipmentId ? 'DCE atualizado com sucesso.' : 'Emissão salva com sucesso.'
      )
      router.push('/shipments')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEmission = async () => {
    if (!token || !shipmentId) return
    if (cancelReason.trim().length < 15) {
      toast.error('A justificativa deve ter pelo menos 15 caracteres.')
      return
    }

    setIsCancelling(true)
    try {
      await shipmentsApi.cancel(token, shipmentId, cancelReason)
      await queryClient.invalidateQueries({ queryKey: ['shipments'] })
      toast.success('Cancelamento solicitado com sucesso.')
      setCancelOpen(false)
      setCancelReason('')
      router.push('/shipments')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao cancelar.')
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <CancelShipmentDialog
        open={cancelOpen}
        onOpenChange={open => {
          setCancelOpen(open)
          if (!open) setCancelReason('')
        }}
        reason={cancelReason}
        onReasonChange={setCancelReason}
        onConfirm={handleCancelEmission}
        isLoading={isCancelling}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <FileStack className="size-6 text-muted-foreground" />
            {readOnly ? 'Visualizar DCE' : shipmentId ? 'Editar DCE' : 'Novo DCE'}
          </h1>
          {company && (
            <span
              className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${
                ambientDisplay === 1
                  ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800'
                  : ambientDisplay === 2
                    ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-800'
                    : 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950 dark:text-slate-400 dark:border-slate-800'
              }`}
            >
              {ambientDisplay === 1
                ? 'Produção'
                : ambientDisplay === 2
                  ? 'Homologação'
                  : 'Simulado'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.push('/shipments')}
            className="h-11 rounded-xl font-bold shadow-sm px-6"
          >
            Voltar
          </Button>
          {!readOnly && (
            <Button
              onClick={handleSave}
              disabled={
                isSaving || isLoadingPersons || !isDirty || shouldBlockNewByLimit
              }
              title={
                shouldBlockNewByLimit
                  ? 'Limite mensal atingido. Não é possível criar nova emissão.'
                  : undefined
              }
              className="h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold shadow-md px-6"
            >
              {isSaving ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Save className="size-4 mr-2" />
              )}
              Salvar
            </Button>
          )}
        </div>
      </div>
      {shouldBlockNewByLimit && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Limite mensal de DC-e atingido. Criação de nova emissão bloqueada.
        </div>
      )}

      <div className="bg-card border rounded-2xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-8">
          <div className="space-y-1 w-full md:w-72">
            <Label className={lbl}>Emitente</Label>
            <NativeSelect
              value={emitterId}
              onChange={e => setEmitterId(e.target.value)}
              disabled={readOnly || !!initialData?.number || isLoadingEmitters}
              className={[
                sel,
                submitted &&
                  !emitterId &&
                  'border-destructive focus-visible:ring-destructive/20',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {!readOnly ? (
                <>
                  <NativeSelectOption value="">
                    {isLoadingEmitters
                      ? 'Carregando emitentes...'
                      : 'Selecionar emitente...'}
                  </NativeSelectOption>
                  {emitters.map(e => (
                    <NativeSelectOption key={e.id} value={e.id}>
                      {e.name}
                    </NativeSelectOption>
                  ))}
                </>
              ) : (
                <NativeSelectOption value={emitterId}>
                  {initialData?.emitter_detail?.name ||
                    initialData?.emit_snapshot?.name ||
                    emitters.find(e => e.id === emitterId)?.name ||
                    'Emitente selecionado'}
                </NativeSelectOption>
              )}
            </NativeSelect>
            {!readOnly && submitted && !emitterId && (
              <p className="text-[10px] text-destructive font-medium ml-1">
                O emitente é obrigatório
              </p>
            )}
          </div>

          <div className="space-y-1 w-full md:w-48">
            <Label className={lbl}>Modal de Transporte</Label>
            <NativeSelect
              value={transportMode}
              onChange={e => setTransportMode(Number(e.target.value))}
              disabled={readOnly}
              className={sel}
            >
              {[
                { label: 'Rodoviário', value: 1 },
                { label: 'Aéreo', value: 2 },
                { label: 'Ferroviário', value: 3 },
                { label: 'Aquaviário', value: 4 },
                { label: 'Dutoviário', value: 5 },
                { label: 'Multimodal', value: 6 },
              ].map(m => (
                <NativeSelectOption key={m.value} value={m.value}>
                  {m.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          {(readOnly || (shipmentId && initialData?.status !== 'draft')) && (
            <div className="space-y-1 flex-1">
              <Label className={lbl}>Status</Label>
              <Input
                readOnly
                disabled
                className={cn(
                  inp,
                  'opacity-100',
                  initialData?.status === 'authorized' && 'bg-green-50/50',
                  initialData?.status === 'cancelled' && 'bg-red-50/50',
                  initialData?.status === 'rejected' && 'bg-orange-50/50'
                )}
                value={
                  initialData?.status === 'authorized'
                    ? 'Autorizado'
                    : initialData?.status === 'cancelled'
                      ? 'Cancelado'
                      : initialData?.status === 'rejected'
                        ? `Rejeitado: ${initialData.rejection_reason || 'Erro desconhecido'}`
                        : 'Processando'
                }
              />
            </div>
          )}
        </div>
      </div>

      <ParteSection
        id="rem"
        label="Remetente"
        value={remetente}
        onChange={setRemetente}
        persons={persons}
        submitted={submitted}
        readOnly={readOnly || isSenderLockedByEmitter}
      />

      <ParteSection
        id="dest"
        label="Destinatário"
        required
        value={destinatario}
        onChange={setDestinatario}
        persons={persons}
        submitted={submitted}
        readOnly={readOnly}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CarrierSection
          tpTransp={tpTransp}
          onTpTranspChange={setTpTransp}
          carrierName={carrierName}
          carrierId={carrierId}
          submitted={submitted}
          onCarrierNameChange={name => {
            setCarrierName(name)
            if (carrierId) setCarrierId('')
          }}
          onCarrierSelect={p => {
            setCarrierId(String(p.id))
            setCarrierName(p.name)
          }}
          disabled={readOnly || isCarrierLockedByEmitter}
        />
        <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Observação
          </p>
          <div className="space-y-1">
            <Label className={lbl}>Informação complementar</Label>
            <Textarea
              value={infoComplementar}
              onChange={e => setInfoComplementar(e.target.value)}
              rows={1}
              disabled={readOnly}
              className={`${inp} min-h-8 px-2.5 py-1 overflow-hidden resize-y`}
            />
          </div>
        </div>
      </div>

      <ItemsList
        items={itens}
        onAdd={addItem}
        onRemove={removeItem}
        onUpdate={updateItem}
        submitted={submitted}
        readOnly={readOnly}
      />

      {!readOnly && (
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-muted-foreground/10">
          <Button
            variant="outline"
            onClick={() => router.push('/shipments')}
            className="h-11 rounded-xl font-bold shadow-sm px-6"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || isLoadingPersons || !isDirty || shouldBlockNewByLimit}
            title={
              shouldBlockNewByLimit
                ? 'Limite mensal atingido. Não é possível criar nova emissão.'
                : undefined
            }
            className="h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold shadow-md px-6"
          >
            {isSaving ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <Save className="size-4 mr-2" />
            )}
            Salvar
          </Button>
        </div>
      )}
    </div>
  )
}
