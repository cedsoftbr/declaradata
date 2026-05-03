import { render, screen } from '@testing-library/react'
import { notFound } from 'next/navigation'
import { describe, expect, it, vi } from 'vitest'
import { usePermissions } from '@/hooks/use-permissions'
import { PermissionGuard } from './permission-guard'

// Mock do hook usePermissions
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: vi.fn(),
}))

// Mock do notFound do Next.js
vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}))

describe('Component: PermissionGuard', () => {
  it('should render children if user has permission', () => {
    vi.mocked(usePermissions).mockReturnValue({
      can: () => true,
    } as unknown as ReturnType<typeof usePermissions>)

    render(
      <PermissionGuard module="products" action="view">
        <div data-testid="allowed">Conteúdo Protegido</div>
      </PermissionGuard>
    )

    // O useEffect do isMounted precisa rodar
    expect(screen.getByTestId('allowed')).toBeInTheDocument()
  })

  it('should call notFound() if user has no permission', () => {
    vi.mocked(usePermissions).mockReturnValue({
      can: () => false,
    } as unknown as ReturnType<typeof usePermissions>)

    render(
      <PermissionGuard module="products" action="view">
        <div data-testid="allowed">Conteúdo Protegido</div>
      </PermissionGuard>
    )

    expect(notFound).toHaveBeenCalled()
  })
})
