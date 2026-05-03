'use client'

import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function LoginForm({ className, ...props }: React.ComponentProps<'form'>) {
  const { setAccessToken } = useAuth()
  const router = useRouter()
  const [view, setView] = useState<'login' | 'reset' | 'reset-done'>('login')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetEmail, setResetEmail] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form = new FormData(e.currentTarget)
    const email = form.get('email') as string
    const password = form.get('password') as string

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = (await res.json()) as {
        access?: string
        requires_2fa?: boolean
        session_token?: string
        error?: string
      }

      if (!res.ok) {
        setError(
          'E-mail não encontrado ou senha inválida.\nVerifique as credenciais e tente novamente.'
        )
        return
      }

      if (data.requires_2fa && data.session_token) {
        sessionStorage.setItem('2fa_session_token', data.session_token)
        router.push('/auth/2fa')
        return
      }

      if (data.access) {
        setAccessToken(data.access)
        await handlePostLoginRedirect(data.access)
      }
    } catch {
      setError('Não foi possível conectar ao servidor.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      })
      setView('reset-done')
    } catch {
      setError('Não foi possível conectar ao servidor.')
    } finally {
      setLoading(false)
    }
  }

  async function handlePostLoginRedirect(accessToken: string) {
    // Busca os dados do usuário para decidir o redirecionamento
    const meRes = await fetch('/api/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (meRes.ok) {
      const user = await meRes.json()
      const nextPath =
        user.profile === 'superadmin' || user.is_superuser || user.is_staff
          ? '/'
          : '/shipments'
      window.location.replace(nextPath)
      return
    }

    window.location.replace('/')
  }

  function goToLogin() {
    setView('login')
    setError(null)
    setResetEmail('')
  }

  const footer = (
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
  )

  if (view === 'reset' || view === 'reset-done') {
    return (
      <div className={cn('flex flex-col gap-6', className)}>
        <FieldGroup>
          {error && (
            <Alert
              variant="destructive"
              className="py-3 px-4 rounded-xl border-destructive/20 bg-destructive/5 animate-in fade-in zoom-in duration-300 relative flex flex-col items-center justify-center min-h-[64px]"
            >
              <div className="text-center">
                <p className="text-[13px] font-medium leading-tight">{error}</p>
              </div>
            </Alert>
          )}

          <div className="flex flex-col items-center gap-1 text-center mb-4">
            <h1 className="text-2xl font-bold">
              {view === 'reset-done' ? 'E-mail enviado' : 'Recuperar senha'}
            </h1>
            <p className="text-sm text-balance text-muted-foreground">
              {view === 'reset-done'
                ? 'Se esse e-mail estiver cadastrado, você receberá as instruções em breve.'
                : 'Informe seu e-mail para receber o link de redefinição.'}
            </p>
          </div>

          {view === 'reset' && (
            <form onSubmit={handleResetSubmit} className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="reset-email">E-mail</FieldLabel>
                <Input
                  id="reset-email"
                  type="email"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </Field>
              <Field>
                <Button
                  type="submit"
                  className="w-full h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold shadow-md"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Enviando...
                    </>
                  ) : (
                    'Enviar'
                  )}
                </Button>
              </Field>
            </form>
          )}

          <Field>
            <button
              type="button"
              className="text-[11px] underline-offset-4 hover:underline w-full text-center"
              onClick={goToLogin}
            >
              Voltar para o login
            </button>
          </Field>
        </FieldGroup>

        {footer}
      </div>
    )
  }

  return (
    <form
      {...props}
      aria-label="login-form"
      method="post"
      className={cn('flex flex-col gap-6', className)}
      onSubmit={handleSubmit}
    >
      <FieldGroup>
        {error && (
          <Alert
            variant="destructive"
            className="py-3 px-4 rounded-xl border-destructive/20 bg-destructive/5 animate-in fade-in zoom-in duration-300 relative flex flex-col items-center justify-center min-h-[64px]"
          >
            <div className="text-center space-y-1">
              {error.split('\n').map(line => (
                <p key={line} className="text-[13px] font-medium leading-tight">
                  {line}
                </p>
              ))}
            </div>
          </Alert>
        )}

        <div className="flex flex-col items-center gap-1 text-center mb-4">
          <h1 className="text-2xl font-bold">Bem-vindo(a)</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Faça o login para acessar o sistema
          </p>
        </div>

        <Field>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
            required
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="password">Senha</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
            required
          />
          <div className="flex justify-center mt-1.5">
            <button
              type="button"
              className="text-[11px] underline-offset-4 hover:underline"
              onClick={() => {
                setError(null)
                setView('reset')
              }}
            >
              Esqueceu sua senha?
            </button>
          </div>
        </Field>

        <Field>
          <Button
            type="submit"
            className="w-full h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold shadow-md"
            disabled={loading}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </Field>
      </FieldGroup>

      {footer}
    </form>
  )
}
