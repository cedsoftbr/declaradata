'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApi } from '@/hooks/use-api'
import { useViaCep } from '@/hooks/use-viacep'
import type { City } from '@/lib/api'

/**
 * Encapsula o preenchimento automático de endereço via CEP para formulários
 * react-hook-form. Inclui carregamento de cidades por UF e auto-seleção pelo
 * código IBGE retornado pelo ViaCep.
 *
 * @param setValue  Função setValue do react-hook-form — deve expor ao menos
 *                  os campos `address`, `neighborhood` e `city_id`.
 * @param initialUf UF inicial (ex.: vinda de initialData ao editar).
 */
export function useCepAutoFill(
  // biome-ignore lint/suspicious/noExplicitAny: setValue do react-hook-form é genérico
  setValue: (name: 'address' | 'neighborhood' | 'city_id', value: any) => void,
  initialUf = ''
) {
  const { call } = useApi()
  const { lookup, isLoading: isLoadingCep } = useViaCep()

  const [selectedUf, setSelectedUf] = useState(initialUf)
  const [cities, setCities] = useState<City[]>([])
  const [loadingCities, setLoadingCities] = useState(false)

  // Guarda o código IBGE recebido do ViaCep para auto-selecionar a cidade
  // depois que o useEffect terminar de carregar a lista de cidades.
  const pendingIbgeRef = useRef<string | null>(null)

  useEffect(() => {
    if (!selectedUf) {
      setCities([])
      return
    }
    setLoadingCities(true)
    // page_size=1000 garante todas as cidades de qualquer UF em uma só request
    // (nenhuma UF brasileira tem mais de 1000 municípios)
    call(`/api/locations/cities?uf=${selectedUf}&page_size=1000`)
      .then(res => res.json())
      .then((data: unknown) => {
        const cityList: City[] = Array.isArray(data)
          ? data
          : ((data as { results?: City[] }).results ?? [])
        setCities(cityList)
        const ibge = pendingIbgeRef.current
        if (ibge) {
          const match = cityList.find(c => c.ibge_code === ibge)
          if (match) setValue('city_id', match.id)
          pendingIbgeRef.current = null
        }
      })
      .catch(() => toast.error('Erro ao carregar cidades'))
      .finally(() => setLoadingCities(false))
  }, [call, selectedUf, setValue])

  const handleCepBlur = async (raw: string) => {
    const data = await lookup(raw)
    if (!data) return

    if (data.logradouro) setValue('address', data.logradouro)
    if (data.bairro) setValue('neighborhood', data.bairro)

    if (data.uf) {
      setValue('city_id', null)
      pendingIbgeRef.current = data.ibge ?? null
      setSelectedUf(data.uf) // dispara o useEffect que carrega cidades e auto-seleciona
    }
  }

  return {
    cities,
    selectedUf,
    setSelectedUf,
    loadingCities,
    handleCepBlur,
    isLoadingCep,
  }
}
