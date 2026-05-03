'use client'

import { useState } from 'react'

type ViaCepResult = {
  logradouro?: string
  bairro?: string
  localidade?: string
  uf?: string
  ibge?: string
}

export function useViaCep() {
  const [isLoading, setIsLoading] = useState(false)

  const lookup = async (raw: string): Promise<ViaCepResult | null> => {
    const cep = raw.replace(/\D/g, '')
    if (cep.length !== 8) return null

    setIsLoading(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = (await res.json()) as ViaCepResult & { erro?: boolean }
      if (data.erro) return null
      return data
    } catch {
      return null
    } finally {
      setIsLoading(false)
    }
  }

  return { lookup, isLoading }
}
