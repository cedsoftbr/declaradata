import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useViaCep } from './use-viacep'

describe('Hook: useViaCep', () => {
  it('should format CEP and call API correctly', async () => {
    const mockResponse = {
      logradouro: 'Rua Teste',
      bairro: 'Bairro Teste',
      localidade: 'Cidade Teste',
      uf: 'TS',
      ibge: '1234567',
    }

    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(mockResponse),
    })

    const { result } = renderHook(() => useViaCep())
    const data = await result.current.lookup('01001-000')

    expect(global.fetch).toHaveBeenCalledWith('https://viacep.com.br/ws/01001000/json/')
    expect(data).toEqual(mockResponse)
  })

  it('should return null for invalid CEP length', async () => {
    const { result } = renderHook(() => useViaCep())
    const data = await result.current.lookup('123')
    expect(data).toBeNull()
  })

  it('should return null if ViaCEP returns error: true', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ erro: true }),
    })

    const { result } = renderHook(() => useViaCep())
    const data = await result.current.lookup('99999999')
    expect(data).toBeNull()
  })

  it('should return null and handle network errors', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useViaCep())
    const data = await result.current.lookup('01001000')
    expect(data).toBeNull()
  })
})
