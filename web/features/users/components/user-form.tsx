'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Mail, Save, User2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { useApi } from '@/hooks/use-api'
import type { Company, Person, User } from '@/lib/api'

import { type UserFormValues, userSchema } from '@/lib/schemas'

interface UserFormProps {
  user?: User
  onSuccess?: () => void
  isSuperAdmin?: boolean
}

const SUPERADMIN_COMPANY_LABEL = process.env.NEXT_PUBLIC_NAME || 'Superadmin'

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: form with many conditional fields
export function UserForm({ user, onSuccess, isSuperAdmin }: UserFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { call } = useApi()
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [companies, setCompanies] = useState<Company[]>([])
  const [emitentes, setEmitentes] = useState<Person[]>([])

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      email: user?.email || '',
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      profile: user?.profile ?? (isSuperAdmin ? 'superadmin' : 'emissor'),
      company_id: user?.company_id ?? null,
      is_active: user?.is_active ?? true,
      password: '',
      allowed_emitente_ids: user?.allowed_emitente_ids ?? [],
    },
  })

  const profileValue = form.watch('profile')
  const companyIdValue = form.watch('company_id')
  const isAdmin = profileValue === 'admin' || profileValue === 'superadmin'

  useEffect(() => {
    if (isAdmin) {
      const currentValues = form.getValues('allowed_emitente_ids')
      if (currentValues && currentValues.length > 0) {
        form.setValue('allowed_emitente_ids', [], { shouldDirty: true })
      }
    }
  }, [isAdmin, form])

  useEffect(() => {
    // No cadastro por superadmin, o perfil é definido pela empresa:
    // com empresa => admin | sem empresa => superadmin
    if (!isSuperAdmin || !!user) return
    const nextProfile = companyIdValue ? 'admin' : 'superadmin'
    if (form.getValues('profile') !== nextProfile) {
      form.setValue('profile', nextProfile, { shouldDirty: false })
    }
  }, [companyIdValue, form, isSuperAdmin, user])

  useEffect(() => {
    const selectedCompanyId = isSuperAdmin ? companyIdValue : null

    if (isSuperAdmin && !selectedCompanyId) {
      setEmitentes([])
      form.setValue('allowed_emitente_ids', [], { shouldDirty: true })
      return
    }

    const loadEmitentes = async () => {
      const qs = new URLSearchParams({
        is_emitente: 'true',
        is_active: 'true',
        page_size: '1000',
      })
      if (selectedCompanyId) {
        qs.set('company', selectedCompanyId)
      }

      try {
        const res = await call(`/api/persons/?${qs.toString()}`)
        if (!res.ok) {
          setEmitentes([])
          return
        }
        const payload = await res.json()
        const rows = Array.isArray(payload) ? payload : (payload.results ?? [])
        setEmitentes(rows)
      } catch {
        setEmitentes([])
      }
    }

    void loadEmitentes()
  }, [form, isSuperAdmin, companyIdValue, call])

  useEffect(() => {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: conditional data loading based on user profile
    async function loadData() {
      try {
        if (isSuperAdmin) {
          const companiesRes = await call('/api/companies/')
          if (companiesRes.ok) {
            const companiesData = await companiesRes.json()
            setCompanies(
              Array.isArray(companiesData) ? companiesData : companiesData.results || []
            )
          }
        }
      } catch (err) {
        console.error('Erro ao carregar empresas', err)
      }
    }
    loadData()
  }, [call, isSuperAdmin])

  async function resendInvite() {
    if (!user) return
    setResending(true)
    try {
      const res = await call(`/api/users/${user.id}/resend-invite/`, { method: 'POST' })
      if (!res.ok) throw new Error()
      toast.success('Convite reenviado com sucesso!')
    } catch {
      toast.error('Erro ao reenviar o convite.')
    } finally {
      setResending(false)
    }
  }

  const onInvalid = () => toast.error('Há campos obrigatórios não preenchidos')

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: form submission with multiple steps and redirects
  async function onSubmit(values: UserFormValues) {
    setLoading(true)
    try {
      const isEdit = !!user
      const url = isEdit ? `/api/users/${user.id}/` : '/api/users/'

      const { password, ...payloadWithout } = values
      const payload = isEdit && password ? values : payloadWithout

      const res = await call(url, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(
          Object.values(errorData).flat().join(', ') || 'Erro ao salvar usuário'
        )
      }

      toast.success(
        isEdit
          ? 'Usuário atualizado!'
          : 'Usuário criado! O convite foi enviado por e-mail.'
      )

      await queryClient.invalidateQueries({ queryKey: ['users'] })
      if (onSuccess) {
        onSuccess()
      } else {
        router.push('/users')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <User2 className="size-6 text-muted-foreground" />
            {user ? 'Editar Usuário' : 'Novo Usuário'}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl font-bold shadow-sm px-6"
            onClick={() => router.push('/users')}
          >
            Cancelar
          </Button>
          {user && (
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl font-bold shadow-sm px-6"
              onClick={resendInvite}
              disabled={resending}
            >
              {resending ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Mail className="size-4 mr-2" />
              )}
              Reenviar convite
            </Button>
          )}
          <Button
            onClick={form.handleSubmit(onSubmit, onInvalid)}
            disabled={loading || !form.formState.isDirty}
            className="h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold transition-all shadow-md px-6"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <Save className="size-4 mr-2" />
            )}
            Salvar
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-2xl p-6 shadow-sm">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
            <div className="flex flex-wrap gap-3 mb-2">
              {user && (
                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between cursor-pointer select-none rounded-xl border px-4 py-3 hover:bg-muted/40 transition-colors flex-1 min-w-[200px]">
                      <FormLabel className="text-sm font-medium m-0 cursor-pointer">
                        Usuário ativo
                      </FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="profile"
                render={({ field }) => (
                  <FormItem className="flex-1 min-w-[220px] space-y-1.5">
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
                      Perfil *
                    </FormLabel>
                    <FormControl>
                      <NativeSelect
                        {...field}
                        value={field.value || (isSuperAdmin ? 'superadmin' : 'emissor')}
                        className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20 shadow-none"
                        onChange={e => field.onChange(e.target.value)}
                        disabled={Boolean(isSuperAdmin && !user)}
                      >
                        {isSuperAdmin ? (
                          <>
                            <option value="superadmin">Superadmin</option>
                            <option value="admin">Admin</option>
                          </>
                        ) : (
                          <>
                            <option value="admin">Admin</option>
                            <option value="emissor">Emissor</option>
                          </>
                        )}
                      </NativeSelect>
                    </FormControl>
                    {isSuperAdmin && !user && (
                      <p className="text-[10px] text-muted-foreground ml-1">
                        Definido automaticamente pela empresa selecionada.
                      </p>
                    )}
                  </FormItem>
                )}
              />
            </div>

            {/* Linha 1: Nome, Sobrenome e Empresa */}
            <div className="flex flex-wrap items-start gap-6">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem className="flex-1 min-w-[200px] space-y-1.5">
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
                      Nome *
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem className="flex-1 min-w-[200px] space-y-1.5">
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
                      Sobrenome *
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isSuperAdmin && (
                <FormField
                  control={form.control}
                  name="company_id"
                  render={({ field }) => (
                    <FormItem className="flex-1 min-w-[250px] space-y-1.5">
                      <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
                        Empresa
                      </FormLabel>
                      <FormControl>
                        <NativeSelect
                          {...field}
                          value={field.value || ''}
                          className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20 shadow-none"
                          onChange={e => field.onChange(e.target.value || null)}
                        >
                          <option value="">{SUPERADMIN_COMPANY_LABEL}</option>
                          {companies.map(c => (
                            <option key={c.id} value={String(c.id)}>
                              {c.trade_name || c.name}
                            </option>
                          ))}
                        </NativeSelect>
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}
            </div>

            <div className="flex flex-wrap items-start gap-6">
              <FormField
                control={form.control}
                name="allowed_emitente_ids"
                render={({ field }) => (
                  <FormItem className="flex-1 min-w-[300px] space-y-1.5">
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
                      Emitentes Permitidos
                    </FormLabel>
                    <FormControl>
                      <NativeSelect
                        value={isAdmin ? '' : field.value?.[0] || ''}
                        disabled={isAdmin}
                        className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20 shadow-none"
                        onChange={e => {
                          const val = e.target.value
                          field.onChange(val ? [val] : [])
                        }}
                      >
                        <option value="">Todos</option>
                        {!isAdmin &&
                          emitentes.map(emitente => (
                            <option key={emitente.id} value={emitente.id}>
                              {emitente.name}
                            </option>
                          ))}
                      </NativeSelect>
                    </FormControl>
                    <p className="text-[10px] text-muted-foreground ml-1">
                      {isAdmin
                        ? 'Administradores têm acesso a todos os emitentes.'
                        : 'Selecione um emitente específico ou "Todos" para dar acesso total.'}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Linha 2: E-mail */}
            <div className="flex flex-wrap items-start gap-6 pt-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="flex-1 min-w-[300px] space-y-1.5">
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
                      E-mail *
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        {...field}
                        className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
      </div>
    </div>
  )
}
