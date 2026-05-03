import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/components/providers/auth-provider'
import { type PermissionAction, usePermissions } from './use-permissions'

// Mock do hook useAuth
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: vi.fn(),
}))

describe('Hook: usePermissions', () => {
  it('should return true for all actions if user is superuser', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { profile: 'superadmin', is_superuser: true },
    } as unknown as ReturnType<typeof useAuth>)

    const { result } = renderHook(() => usePermissions())
    expect(result.current.can('products', 'view')).toBe(true)
    expect(result.current.can('anything', 'delete')).toBe(true)
  })

  it('should return true if user is staff (admin)', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { profile: 'superadmin', is_staff: true },
    } as unknown as ReturnType<typeof useAuth>)

    const { result } = renderHook(() => usePermissions())
    expect(result.current.can('persons', 'create')).toBe(true)
  })

  it('should return true if user is company admin', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { profile: 'admin' },
    } as unknown as ReturnType<typeof useAuth>)

    const { result } = renderHook(() => usePermissions())
    expect(result.current.can('dce', 'view')).toBe(true)
  })

  it('should allow emissor access to operational modules', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        profile: 'emissor',
        is_superuser: false,
        is_staff: false,
      },
    } as unknown as ReturnType<typeof useAuth>)

    const { result } = renderHook(() => usePermissions())

    expect(result.current.can('products', 'view')).toBe(true)
    expect(result.current.can('products', 'create')).toBe(true)
    expect(result.current.can('persons', 'view')).toBe(true)
  })

  it('should return false if no user is authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as unknown as ReturnType<
      typeof useAuth
    >)
    const { result } = renderHook(() => usePermissions())
    expect(result.current.can('products', 'view')).toBe(false)
  })

  it('should use fine-grained permissions if user profile is not one of the pre-defined ones', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        profile: 'user',
        permissions: {
          products: {
            can_view: true,
            can_create: false,
            can_edit: true,
            can_delete: false,
          },
        },
      },
    } as unknown as ReturnType<typeof useAuth>)

    const { result } = renderHook(() => usePermissions())
    expect(result.current.can('products', 'view')).toBe(true)
    expect(result.current.can('products', 'create')).toBe(false)
    expect(result.current.can('products', 'edit')).toBe(true)
    expect(result.current.can('products', 'delete')).toBe(false)
    expect(result.current.can('products', 'unknown' as PermissionAction)).toBe(false)
    expect(result.current.can('unknown_module')).toBe(false)
  })
})
