import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './auth-provider'

const TestComponent = () => {
  const { user, isAuthenticated, isInitializing, refreshAccessToken } = useAuth()
  return (
    <div>
      <div data-testid="initializing">{isInitializing.toString()}</div>
      <div data-testid="authenticated">{isAuthenticated.toString()}</div>
      <div data-testid="user">{user?.email ?? 'no user'}</div>
      <button type="button" onClick={() => refreshAccessToken()}>
        Refresh
      </button>
    </div>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    window.sessionStorage.clear()
  })

  it('should NOT auto-refresh when sessionStorage is empty (new browser session)', async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('initializing')).toHaveTextContent('false')
    })

    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/auth/refresh',
      expect.anything()
    )
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
  })

  it('should restore token from sessionStorage without calling refresh', async () => {
    window.sessionStorage.setItem('dd_access_token', 'stored-token')

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1, email: 'stored@example.com' }),
    } as unknown as Response)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    })

    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/auth/refresh',
      expect.anything()
    )

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('stored@example.com')
    })
  })

  it('should use provided initialAccessToken', async () => {
    // Mock /api/users/me
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1, email: 'initial@example.com' }),
    } as unknown as Response)

    render(
      <AuthProvider initialAccessToken="initial-token">
        <TestComponent />
      </AuthProvider>
    )

    // Should NOT be initializing since we have a token
    expect(screen.getByTestId('initializing')).toHaveTextContent('false')
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true')

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('initial@example.com')
    })

    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/auth/refresh',
      expect.anything()
    )
  })
})
