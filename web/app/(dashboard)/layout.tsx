'use client'

import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AppSidebar } from '@/components/app-sidebar'
import { Header } from '@/components/layout/header'
import { useAuth } from '@/components/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useApi } from '@/hooks/use-api'
import { parseApiError } from '@/lib/utils'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitializing, user, setUser } = useAuth()
  const { call } = useApi()
  const router = useRouter()
  const pathname = usePathname()
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const [isSavingConsent, setIsSavingConsent] = useState(false)

  const requireConsent = useMemo(() => {
    if (!user) return false
    return !user.terms_accepted_at || !user.privacy_policy_accepted_at
  }, [user])

  useEffect(() => {
    if (!isInitializing) {
      if (!isAuthenticated) {
        router.push('/auth/login')
      } else if (user && pathname === '/') {
        // Se não for superuser/staff, não pode acessar o Dashboard
        if (user.profile !== 'superadmin' && !user.is_superuser && !user.is_staff) {
          router.push('/shipments')
        }
      }
    }
  }, [isInitializing, isAuthenticated, user, router, pathname])

  const handleAcceptConsent = async () => {
    if (!acceptTerms || !acceptPrivacy) return
    setIsSavingConsent(true)
    try {
      const res = await call('/api/users/me/', {
        method: 'PATCH',
        body: JSON.stringify({
          accept_terms: true,
          accept_privacy: true,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(parseApiError(err) || 'Erro ao registrar aceite.')
      }
      const data = await res.json()
      setUser(data)
      setAcceptTerms(false)
      setAcceptPrivacy(false)
      toast.success('Aceite registrado com sucesso.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao registrar aceite.')
    } finally {
      setIsSavingConsent(false)
    }
  }

  // Enquanto verifica a sessão do cookie, mostra spinner em vez de redirecionar
  if (isInitializing) {
    return (
      <div className="flex flex-col h-screen items-center justify-center gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground font-medium">Carregando...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  // Previne renderizar o Dashboard (/) por um milissegundo antes do redirecionamento
  if (
    pathname === '/' &&
    user &&
    user.profile !== 'superadmin' &&
    !user.is_superuser &&
    !user.is_staff
  ) {
    return null
  }

  return (
    <SidebarProvider>
      <Dialog open={requireConsent}>
        <DialogContent showCloseButton={false} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Aceite obrigatório para continuar</DialogTitle>
            <DialogDescription>
              Para acessar o sistema, confirme o aceite dos Termos de Uso e da Política
              de Privacidade.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="flex items-start gap-2">
              <Checkbox
                id="consent-terms-gate"
                checked={acceptTerms}
                onCheckedChange={checked => setAcceptTerms(checked === true)}
              />
              <Label
                htmlFor="consent-terms-gate"
                className="text-sm font-normal leading-relaxed"
              >
                Li e aceito os{' '}
                <Link href="/termos" target="_blank" className="underline">
                  Termos de Uso
                </Link>
                .
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="consent-privacy-gate"
                checked={acceptPrivacy}
                onCheckedChange={checked => setAcceptPrivacy(checked === true)}
              />
              <Label
                htmlFor="consent-privacy-gate"
                className="text-sm font-normal leading-relaxed"
              >
                Li e aceito a{' '}
                <Link href="/privacidade" target="_blank" className="underline">
                  Política de Privacidade
                </Link>
                .
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleAcceptConsent}
              disabled={!acceptTerms || !acceptPrivacy || isSavingConsent}
              className="w-full sm:w-auto"
            >
              {isSavingConsent ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : null}
              Aceitar e continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AppSidebar />
      <SidebarInset>
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
