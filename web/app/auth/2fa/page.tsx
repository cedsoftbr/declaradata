'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { PinInput } from '@/components/ui/pin-input'

export default function TwoFAPage() {
  const APP_NAME = process.env.NEXT_PUBLIC_NAME ?? 'Declaradata'
  const router = useRouter()
  const { setAccessToken } = useAuth()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const sessionToken = useRef<string | null>(null)

  useEffect(() => {
    const token = sessionStorage.getItem('2fa_session_token')
    if (!token) {
      router.replace('/auth/login')
      return
    }
    sessionToken.current = token
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pin.length !== 6) return
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: sessionToken.current, pin }),
      })

      const data = (await res.json()) as { access?: string; detail?: string }

      if (!res.ok) {
        setError(data.detail ?? 'Código inválido. Tente novamente.')
        setPin('')
        return
      }

      sessionStorage.removeItem('2fa_session_token')
      const access = data.access ?? ''
      setAccessToken(access)

      const meRes = await fetch('/api/users/me', {
        headers: { Authorization: `Bearer ${access}` },
      })
      if (meRes.ok) {
        const user = await meRes.json()
        const nextPath =
          user.profile === 'superadmin' || user.is_superuser || user.is_staff
            ? '/'
            : '/shipments'
        window.location.replace(nextPath)
      } else {
        window.location.replace('/')
      }
    } catch {
      setError('Não foi possível conectar ao servidor.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <span className="text-2xl font-bold uppercase tracking-tight">
            {APP_NAME}
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs flex flex-col gap-6">
            <div className="flex flex-col items-center gap-1 text-center">
              <h1 className="text-2xl font-bold">Verificação em dois fatores</h1>
              <p className="text-sm text-balance text-muted-foreground">
                Digite o código de 6 dígitos enviado para o seu e-mail.
              </p>
            </div>

            {error && (
              <Alert
                variant="destructive"
                className="py-3 px-4 rounded-xl border-destructive/20 bg-destructive/5 animate-in fade-in zoom-in duration-300"
              >
                <p className="text-[13px] font-medium text-center leading-tight">
                  {error}
                </p>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col items-center gap-6">
              <PinInput value={pin} onChange={setPin} disabled={loading} />

              <Button
                type="submit"
                className="w-full h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold shadow-md"
                disabled={loading || pin.length !== 6}
              >
                {loading ? 'Verificando...' : 'Verificar'}
              </Button>
            </form>

            <button
              type="button"
              className="text-[11px] underline-offset-4 hover:underline text-center text-muted-foreground"
              onClick={() => {
                sessionStorage.removeItem('2fa_session_token')
                router.push('/auth/login')
              }}
            >
              Voltar para o login
            </button>

            <div className="text-center text-xs space-y-2 text-muted-foreground">
              <p>
                Um produto{' '}
                <a
                  href="https://cedsoft.com.br"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-foreground hover:underline transition-colors"
                >
                  CEDSoft Informática
                </a>
              </p>
              <p className="text-[11px] tracking-wider font-medium">
                © Copyright 2026. Todos os direitos reservados
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative hidden bg-muted lg:block overflow-hidden">
        <Image
          src="/personal-1.png"
          alt="Declaradata"
          fill
          sizes="50vw"
          className="object-cover"
          priority
        />
      </div>
    </div>
  )
}
