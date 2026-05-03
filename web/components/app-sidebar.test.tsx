import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/components/providers/auth-provider'
import { usePermissions } from '@/hooks/use-permissions'
import { AppSidebar } from './app-sidebar'

// Mocks necessários
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: vi.fn(),
}))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SidebarProvider } from '@/components/ui/sidebar'

describe('Component: AppSidebar', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  it('should show administration menu for superadmins', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        email: 'admin@test.com',
        profile: 'superadmin',
        is_superuser: true,
        company_name: 'Declaradata',
      },
    } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(usePermissions).mockReturnValue({
      can: () => true,
    } as unknown as ReturnType<typeof usePermissions>)

    render(
      <QueryClientProvider client={queryClient}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </QueryClientProvider>
    )

    expect(screen.getByText(/administração/i)).toBeInTheDocument()
    expect(screen.getByText(/empresas/i)).toBeInTheDocument()
  })

  it('should hide administration menu for collaborators', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        email: 'colab@test.com',
        profile: 'emissor',
        is_superuser: false,
        is_staff: false,
        company_name: 'Empresa Cliente',
      },
    } as unknown as ReturnType<typeof useAuth>)
    // Simula que ele só pode ver produtos
    vi.mocked(usePermissions).mockReturnValue({
      can: (mod: string) => mod === 'products',
    } as unknown as ReturnType<typeof usePermissions>)

    render(
      <QueryClientProvider client={queryClient}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </QueryClientProvider>
    )

    expect(screen.queryByText(/administração/i)).not.toBeInTheDocument()
    expect(screen.getByText(/produtos/i)).toBeInTheDocument()
    expect(screen.queryByText(/pessoas/i)).not.toBeInTheDocument()
  })
})
