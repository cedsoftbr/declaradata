'use client'

import { notFound } from 'next/navigation'
import { useEffect, useState } from 'react'
import { type PermissionAction, usePermissions } from '@/hooks/use-permissions'

interface PermissionGuardProps {
  module: string
  action?: PermissionAction
  children: React.ReactNode
}

export function PermissionGuard({
  module,
  action = 'view',
  children,
}: PermissionGuardProps) {
  const { can } = usePermissions()
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true)
  }, [])

  // Enquanto não montado no client, não renderiza nada para evitar mismatch de hydration
  if (!isMounted) return null

  // Se o usuário não tiver permissão granular -> 404 (para parecer que a rota não existe)
  if (!can(module, action)) {
    return notFound()
  }

  return <>{children}</>
}
