'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'
import { UserForm } from '@/features/users/components/user-form'

export default function NewUserPage() {
  const router = useRouter()
  const { user: me } = useAuth()
  const isSuperAdmin = me?.profile === 'superadmin'

  return (
    <UserForm
      isSuperAdmin={isSuperAdmin}
      onSuccess={() => {
        router.push('/users')
        router.refresh()
      }}
    />
  )
}
