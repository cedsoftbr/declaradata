import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/components/providers/auth-provider'
import { LoginForm } from './login-form'

// Mocks
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

describe('Component: LoginForm', () => {
  const mockSetAccessToken = vi.fn()
  const mockReplace = vi.fn()
  const mockRouterPush = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // biome-ignore lint/suspicious/noExplicitAny: mock types
    vi.mocked(useAuth).mockReturnValue({ setAccessToken: mockSetAccessToken } as any)
    // biome-ignore lint/suspicious/noExplicitAny: mock types
    vi.mocked(useRouter).mockReturnValue({ push: mockRouterPush } as any)
    global.fetch = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, replace: mockReplace },
      writable: true,
    })
    sessionStorage.clear()
  })

  it('should call login and redirect on success', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access: 'test-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ is_superuser: false, is_staff: false }),
      })

    render(<LoginForm />)

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'test@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
        })
      )
      expect(mockSetAccessToken).toHaveBeenCalledWith('test-token')
      expect(mockReplace).toHaveBeenCalledWith('/shipments')
    })
  })

  it('should show error message when login fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Invalid credentials' }),
    })

    render(<LoginForm />)

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'wrong@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: 'wrongpass' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }))

    await waitFor(() => {
      expect(screen.getByText(/E-mail não encontrado ou senha inválida/i)).toBeDefined()
    })
  })

  it('should handle network errors', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    render(<LoginForm />)

    // Disparando o submit diretamente no form
    fireEvent.submit(screen.getByLabelText('login-form'))

    const errorMessage = await screen.findByText(
      /Não foi possível conectar ao servidor/i
    )
    expect(errorMessage).toBeDefined()
  })

  it('should redirect to /auth/2fa and store session_token when requires_2fa', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ requires_2fa: true, session_token: 'tok123' }),
    })

    render(<LoginForm />)

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: 'senha123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }))

    await waitFor(() => {
      expect(sessionStorage.getItem('2fa_session_token')).toBe('tok123')
      expect(mockRouterPush).toHaveBeenCalledWith('/auth/2fa')
      expect(mockSetAccessToken).not.toHaveBeenCalled()
    })
  })
})
