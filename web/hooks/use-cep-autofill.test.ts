import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useApi } from '@/hooks/use-api'
import { useViaCep } from '@/hooks/use-viacep'
import { useCepAutoFill } from './use-cep-autofill'

vi.mock('@/hooks/use-api')
vi.mock('@/hooks/use-viacep')
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const cityList = [
  { id: 'uuid-curitiba', name: 'Curitiba', uf: 'PR', ibge_code: '4106902' },
  { id: 'uuid-maringa', name: 'Maringá', uf: 'PR', ibge_code: '4115200' },
]

function makeCall(cities = cityList) {
  return vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ results: cities }),
  })
}

function makeViaCep(result: object | null = null) {
  return {
    lookup: vi.fn().mockResolvedValue(result),
    isLoading: false,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Hook: useCepAutoFill — carregamento de cidades', () => {
  it('carrega cidades quando UF é selecionada', async () => {
    const mockCall = makeCall()
    vi.mocked(useApi).mockReturnValue({ call: mockCall, callSafe: vi.fn() })
    vi.mocked(useViaCep).mockReturnValue(makeViaCep())

    const setValue = vi.fn()
    const { result } = renderHook(() => useCepAutoFill(setValue))

    act(() => result.current.setSelectedUf('PR'))

    await waitFor(() => {
      expect(result.current.cities).toHaveLength(2)
    })

    expect(mockCall).toHaveBeenCalledWith(expect.stringContaining('uf=PR'))
  })

  it('limpa cidades quando UF é desmarcada', async () => {
    const mockCall = makeCall()
    vi.mocked(useApi).mockReturnValue({ call: mockCall, callSafe: vi.fn() })
    vi.mocked(useViaCep).mockReturnValue(makeViaCep())

    const setValue = vi.fn()
    const { result } = renderHook(() => useCepAutoFill(setValue))

    act(() => result.current.setSelectedUf('PR'))
    await waitFor(() => expect(result.current.cities).toHaveLength(2))

    act(() => result.current.setSelectedUf(''))
    await waitFor(() => expect(result.current.cities).toHaveLength(0))
  })

  it('inicializa com a UF fornecida e carrega cidades', async () => {
    const mockCall = makeCall()
    vi.mocked(useApi).mockReturnValue({ call: mockCall, callSafe: vi.fn() })
    vi.mocked(useViaCep).mockReturnValue(makeViaCep())

    const setValue = vi.fn()
    renderHook(() => useCepAutoFill(setValue, 'PR'))

    await waitFor(() => {
      expect(mockCall).toHaveBeenCalledWith(expect.stringContaining('uf=PR'))
    })
  })
})

describe('Hook: useCepAutoFill — handleCepBlur', () => {
  it('preenche endereço e bairro quando ViaCep retorna dados', async () => {
    vi.mocked(useApi).mockReturnValue({ call: makeCall(), callSafe: vi.fn() })
    vi.mocked(useViaCep).mockReturnValue(
      makeViaCep({
        logradouro: 'Rua das Flores',
        bairro: 'Centro',
        uf: 'PR',
        ibge: '4106902',
      })
    )

    const setValue = vi.fn()
    const { result } = renderHook(() => useCepAutoFill(setValue))

    await act(() => result.current.handleCepBlur('80000-000'))

    expect(setValue).toHaveBeenCalledWith('address', 'Rua das Flores')
    expect(setValue).toHaveBeenCalledWith('neighborhood', 'Centro')
  })

  it('não chama setValue se ViaCep não retornar dados', async () => {
    vi.mocked(useApi).mockReturnValue({ call: makeCall(), callSafe: vi.fn() })
    vi.mocked(useViaCep).mockReturnValue(makeViaCep(null))

    const setValue = vi.fn()
    const { result } = renderHook(() => useCepAutoFill(setValue))

    await act(() => result.current.handleCepBlur('00000-000'))

    expect(setValue).not.toHaveBeenCalled()
  })

  it('atualiza a UF selecionada quando ViaCep retorna UF', async () => {
    vi.mocked(useApi).mockReturnValue({ call: makeCall(), callSafe: vi.fn() })
    vi.mocked(useViaCep).mockReturnValue(makeViaCep({ uf: 'SC', ibge: '4205407' }))

    const setValue = vi.fn()
    const { result } = renderHook(() => useCepAutoFill(setValue))

    await act(() => result.current.handleCepBlur('88000-000'))

    expect(result.current.selectedUf).toBe('SC')
  })
})

describe('Hook: useCepAutoFill — auto-seleção de cidade por IBGE', () => {
  it('auto-seleciona a cidade pelo código IBGE após carregar a lista', async () => {
    const mockCall = makeCall()
    vi.mocked(useApi).mockReturnValue({ call: mockCall, callSafe: vi.fn() })
    vi.mocked(useViaCep).mockReturnValue(
      makeViaCep({
        logradouro: 'Rua XV de Novembro',
        bairro: 'Centro',
        uf: 'PR',
        ibge: '4106902', // Curitiba
      })
    )

    const setValue = vi.fn()
    const { result } = renderHook(() => useCepAutoFill(setValue))

    // Dispara o blur do CEP — salva o IBGE no ref e muda a UF
    await act(() => result.current.handleCepBlur('80020-907'))

    // Aguarda o useEffect carregar as cidades e auto-selecionar
    await waitFor(() => {
      expect(setValue).toHaveBeenCalledWith('city_id', 'uuid-curitiba')
    })
  })

  it('não auto-seleciona se o IBGE não encontrar cidade na lista', async () => {
    vi.mocked(useApi).mockReturnValue({ call: makeCall(), callSafe: vi.fn() })
    vi.mocked(useViaCep).mockReturnValue(
      makeViaCep({ uf: 'PR', ibge: '9999999' }) // IBGE que não existe na lista
    )

    const setValue = vi.fn()
    const { result } = renderHook(() => useCepAutoFill(setValue))

    await act(() => result.current.handleCepBlur('80000-000'))
    await waitFor(() => expect(result.current.cities).toHaveLength(2))

    // setValue('city_id') chamado para limpar, mas não para selecionar
    expect(setValue).toHaveBeenCalledWith('city_id', null)
    expect(setValue).not.toHaveBeenCalledWith('city_id', expect.stringMatching(/uuid/))
  })
})
