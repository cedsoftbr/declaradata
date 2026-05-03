'use client'

import { Loader2, LockKeyhole, Save, UserCircle2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useApi } from '@/hooks/use-api'
import { parseApiError } from '@/lib/utils'

export default function ProfilePage() {
  const { user, setUser } = useAuth()
  const { call } = useApi()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isTogglingTwoFA, setIsTogglingTwoFA] = useState(false)
  const [openPwdModal, setOpenPwdModal] = useState(false)
  const [pwd1, setPwd1] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [isChangingPwd, setIsChangingPwd] = useState(false)

  useEffect(() => {
    setFirstName(user?.first_name || '')
    setLastName(user?.last_name || '')
  }, [user])

  const isDirty = useMemo(
    () =>
      firstName.trim() !== (user?.first_name || '') ||
      lastName.trim() !== (user?.last_name || ''),
    [firstName, lastName, user]
  )

  const canSubmitPwd =
    pwd1.trim().length >= 8 && pwd2.trim().length >= 8 && pwd1 === pwd2

  const handleSave = async () => {
    if (!isDirty) return
    setIsSaving(true)
    try {
      const res = await call('/api/users/me/', {
        method: 'PATCH',
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(parseApiError(err) || 'Erro ao atualizar perfil')
      }
      const data = await res.json()
      setUser(data)
      toast.success('Perfil atualizado com sucesso.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar perfil.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleTwoFA = async () => {
    if (!user) return
    setIsTogglingTwoFA(true)
    const newValue = !user.twofa_enabled
    try {
      const res = await call('/api/users/me/', {
        method: 'PATCH',
        body: JSON.stringify({ twofa_enabled: newValue }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(parseApiError(err) || 'Erro ao alterar 2FA')
      }
      const data = await res.json()
      setUser(data)
      toast.success(newValue ? '2FA habilitado com sucesso.' : '2FA desabilitado.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao alterar 2FA.')
    } finally {
      setIsTogglingTwoFA(false)
    }
  }

  const handleChangePassword = async () => {
    if (!canSubmitPwd) return
    setIsChangingPwd(true)
    try {
      const res = await call('/api/users/set-password/', {
        method: 'POST',
        body: JSON.stringify({
          new_password1: pwd1,
          new_password2: pwd2,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(parseApiError(err) || 'Erro ao alterar senha')
      }
      setPwd1('')
      setPwd2('')
      setOpenPwdModal(false)
      toast.success('Senha alterada com sucesso.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao alterar senha.')
    } finally {
      setIsChangingPwd(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <UserCircle2 className="size-6 text-muted-foreground" />
          Meu Perfil
        </h1>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setOpenPwdModal(true)}
            className="h-11 rounded-xl font-bold shadow-sm px-6"
          >
            <LockKeyhole className="size-4 mr-2" />
            Alterar senha
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold shadow-md px-6"
          >
            {isSaving ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <Save className="size-4 mr-2" />
            )}
            Salvar
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-6">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Dados da Conta
          </p>
          <p className="text-sm text-muted-foreground">
            Atualize seus dados pessoais de exibição.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
              Nome
            </Label>
            <Input
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
              Sobrenome
            </Label>
            <Input
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
              E-mail
            </Label>
            <Input
              value={user?.email || ''}
              disabled
              className="h-10 rounded-xl border-muted-foreground/20 bg-muted/30"
            />
          </div>
        </div>
      </div>

      {user?.profile !== 'viewer' && (
        <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Segurança
              </p>
              <p className="text-sm text-muted-foreground">
                Autenticação em dois fatores (2FA) via e-mail.
              </p>
            </div>
            <Button
              variant={user?.twofa_enabled ? 'outline' : 'default'}
              onClick={handleToggleTwoFA}
              disabled={isTogglingTwoFA}
              className="h-9 rounded-xl font-bold px-5 text-sm"
            >
              {isTogglingTwoFA ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : null}
              {user?.twofa_enabled ? 'Desabilitar' : 'Habilitar'}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <Link href="/termos" target="_blank" className="underline">
          Termos de Uso
        </Link>
        <Link href="/privacidade" target="_blank" className="underline">
          Política de Privacidade
        </Link>
      </div>

      <Dialog open={openPwdModal} onOpenChange={setOpenPwdModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>
              Informe e confirme a nova senha. Mínimo de 8 caracteres.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nova senha</Label>
              <Input
                type="password"
                value={pwd1}
                onChange={e => setPwd1(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Confirmar senha</Label>
              <Input
                type="password"
                value={pwd2}
                onChange={e => setPwd2(e.target.value)}
              />
            </div>
            {pwd2 && pwd1 !== pwd2 && (
              <p className="text-[11px] text-destructive">As senhas não coincidem.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenPwdModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={!canSubmitPwd || isChangingPwd}
            >
              {isChangingPwd ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
