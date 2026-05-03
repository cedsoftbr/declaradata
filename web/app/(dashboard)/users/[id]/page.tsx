'use client'

import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { use, useEffect, useState } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import type { User } from '@/features/users/api'
import { UserForm } from '@/features/users/components/user-form'
import { useApi } from '@/hooks/use-api'

export default function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { call } = useApi()
  const { user: me } = useAuth()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const isSuperAdmin = me?.profile === 'superadmin'

  useEffect(() => {
    async function load() {
      try {
        const res = await call(`/api/users/${id}/`)
        if (res.ok) {
          const data = (await res.json()) as User
          setUser(data)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [call, id])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground font-medium">Carregando...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Usuário não encontrado.
      </div>
    )
  }

  return (
    <UserForm
      user={user}
      isSuperAdmin={isSuperAdmin}
      onSuccess={() => {
        router.push('/users')
        router.refresh()
      }}
    />
  )
}
