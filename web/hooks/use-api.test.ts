import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/components/providers/auth-provider'
import { useApi } from './use-api'

vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: vi.fn(),
}))

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/',
}))

function makeAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  return {
    getAccessToken: vi.fn().mockReturnValue('token-abc'),
    refreshAccessToken: vi.fn().mockResolvedValue('token-refreshed'),
    setAccessToken: vi.fn(),
    user: null,
    accessToken: 'token-abc',
    isInitializing: false,
    isAuthenticated: true,
    setUser: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useAuth>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Hook: useApi — call', () => {
  it('injeta Bearer token no header da requisição', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuth())
    global.fetch = vi.fn().mockResolvedValue({ status: 200, ok: true })

    const { result } = renderHook(() => useApi())
    await result.current.call('/api/test')

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-abc' }),
      })
    )
  })

  it('faz refresh quando não há token em memória e usa o token novo', async () => {
    vi.mocked(useAuth).mockReturnValue(
      makeAuth({ getAccessToken: vi.fn().mockReturnValue(null) })
    )
    global.fetch = vi.fn().mockResolvedValue({ status: 200, ok: true })

    const { result } = renderHook(() => useApi())
    await result.current.call('/api/test')

    const auth = vi.mocked(useAuth).mock.results[0].value
    expect(auth.refreshAccessToken).toHaveBeenCalled()
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-refreshed' }),
      })
    )
  })

  it('em 401: faz refresh e retentar a requisição', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuth())
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ status: 401, ok: false })
      .mockResolvedValueOnce({ status: 200, ok: true })

    const { result } = renderHook(() => useApi())
    const res = await result.current.call('/api/test')

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(res.status).toBe(200)
  })

  it('em 401 e refresh falha: limpa token e redireciona para /auth/login', async () => {
    vi.mocked(useAuth).mockReturnValue(
      makeAuth({ refreshAccessToken: vi.fn().mockResolvedValue(null) })
    )
    global.fetch = vi.fn().mockResolvedValue({ status: 401, ok: false })

    const { result } = renderHook(() => useApi())
    await result.current.call('/api/test')

    const auth = vi.mocked(useAuth).mock.results[0].value
    expect(auth.setAccessToken).toHaveBeenCalledWith(null)
    expect(mockPush).toHaveBeenCalledWith('/auth/login')
  })

  it('em segundo 401 consecutivo: limpa token e redireciona para /auth/login', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuth())
    global.fetch = vi.fn().mockResolvedValue({ status: 401, ok: false })

    const { result } = renderHook(() => useApi())
    await result.current.call('/api/test')

    const auth = vi.mocked(useAuth).mock.results[0].value
    expect(auth.setAccessToken).toHaveBeenCalledWith(null)
    expect(mockPush).toHaveBeenCalledWith('/auth/login')
  })

  it('não define Content-Type ao enviar FormData', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuth())
    global.fetch = vi.fn().mockResolvedValue({ status: 200, ok: true })

    const { result } = renderHook(() => useApi())
    await result.current.call('/api/upload', {
      method: 'POST',
      body: new FormData(),
    })

    const headers = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('define Content-Type application/json em requisições normais', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuth())
    global.fetch = vi.fn().mockResolvedValue({ status: 200, ok: true })

    const { result } = renderHook(() => useApi())
    await result.current.call('/api/test', { method: 'POST', body: '{}' })

    const headers = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers
    expect(headers['Content-Type']).toBe('application/json')
  })
})

describe('Hook: useApi — callSafe', () => {
  it('retorna a response em caso de sucesso', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuth())
    global.fetch = vi.fn().mockResolvedValue({ status: 200, ok: true })

    const { result } = renderHook(() => useApi())
    const res = await result.current.callSafe('/api/test')

    expect(res).not.toBeNull()
    expect(res?.ok).toBe(true)
  })

  it('retorna null quando a response não é ok', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuth())
    global.fetch = vi.fn().mockResolvedValue({
      status: 422,
      ok: false,
      json: () => Promise.resolve({ error: 'Dado inválido' }),
    })

    const { result } = renderHook(() => useApi())
    const res = await result.current.callSafe('/api/test')

    expect(res).toBeNull()
  })

  it('retorna null em erro de rede', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuth())
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useApi())
    const res = await result.current.callSafe('/api/test')

    expect(res).toBeNull()
  })
})
