'use client'

import { useCallback } from 'react'
import { useAuth } from '@/components/providers/auth-provider'

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete'

export function usePermissions() {
  const { user } = useAuth()

  const can = useCallback(
    (module: string, action: PermissionAction = 'view') => {
      if (!user) return false

      // Superadmin tem acesso total
      if (user.profile === 'superadmin' || user.is_superuser || user.is_staff) {
        return true
      }

      // Admin e emissor da empresa têm acesso operacional completo
      if (user.profile === 'admin' || user.profile === 'emissor') {
        return true
      }

      const perms = user.permissions?.[module as keyof typeof user.permissions]
      if (!perms) return false

      switch (action) {
        case 'view':
          return !!perms.can_view
        case 'create':
          return !!perms.can_create
        case 'edit':
          return !!perms.can_edit
        case 'delete':
          return !!perms.can_delete
        default:
          return false
      }
    },
    [user]
  )

  return { can }
}
