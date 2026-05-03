'use client'

import { Loader2 } from 'lucide-react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

const LOGIN_IMAGES = ['/personal-1.png', '/personal-2.png', '/personal-3.png']
const LOGIN_IMAGE_STORAGE_KEY = 'login-image-index'

import { toast } from 'sonner'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const APP_NAME = process.env.NEXT_PUBLIC_NAME ?? 'Declaradata'

function DefinirSenhaForm() {
  const router = useRouter()
  const params = useSearchParams()

  // Limpeza de artefatos de codificação Quoted-Printable (comum em e-mails)
  // Ex: transforma "3D=Mw" em "Mw" e "3Dd6zo..." em "d6zo..."
  const cleanParam = (key: string) => {
    const val = params.get(key) ?? ''
    return val.replace(/^3D/, '').replace(/=/g, '')
  }

  const uid = cleanParam('uid')
  const token = cleanParam('token')

  const [loginImage, setLoginImage] = useState(LOGIN_IMAGES[0])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const previousIndexRaw = window.sessionStorage.getItem(LOGIN_IMAGE_STORAGE_KEY)
    const previousIndex = Number.parseInt(previousIndexRaw ?? '', 10)
    const availableIndexes = LOGIN_IMAGES.map((_, idx) => idx).filter(
      idx => idx !== previousIndex
    )
    const pool = availableIndexes.length > 0 ? availableIndexes : [0]
    const nextIndex = pool[Math.floor(Math.random() * pool.length)]
    window.sessionStorage.setItem(LOGIN_IMAGE_STORAGE_KEY, String(nextIndex))
    setLoginImage(LOGIN_IMAGES[nextIndex])
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }
    if (!uid || !token) {
      setError('Link inválido ou expirado.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/password/reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid,
          token,
          new_password1: password,
          new_password2: confirm,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg =
          data?.new_password2?.[0] ??
          data?.token?.[0] ??
          data?.uid?.[0] ??
          data?.detail ??
          'Erro ao definir senha. O link pode ter expirado.'
        setError(msg)
        return
      }

      setDone(true)
      toast.success('Senha definida com sucesso!')
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
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold uppercase tracking-tight">
              {APP_NAME}
            </span>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
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
                    {done ? 'Senha definida!' : 'Defina sua senha'}
                  </h1>
                  <p className="text-sm text-balance text-muted-foreground">
                    {done
                      ? 'Você já pode acessar o sistema.'
                      : 'Crie uma senha segura para acessar o sistema.'}
                  </p>
                </div>

                {done ? (
                  <Field>
                    <Button
                      type="button"
                      className="w-full h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold shadow-md"
                      onClick={() => router.push('/auth/login')}
                    >
                      Ir para o login
                    </Button>
                  </Field>
                ) : (
                  <>
                    <Field>
                      <FieldLabel htmlFor="password">Nova senha</FieldLabel>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
                        required
                        autoComplete="new-password"
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="confirm">Confirmar senha</FieldLabel>
                      <Input
                        id="confirm"
                        type="password"
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
                        required
                        autoComplete="new-password"
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
                            Salvando...
                          </>
                        ) : (
                          'Definir senha'
                        )}
                      </Button>
                    </Field>
                  </>
                )}
              </FieldGroup>

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
            </form>
          </div>
        </div>
      </div>

      <div className="relative hidden bg-muted lg:block">
        <Image
          src={loginImage}
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

export default function DefinirSenhaPage() {
  return (
    <Suspense>
      <DefinirSenhaForm />
    </Suspense>
  )
}
