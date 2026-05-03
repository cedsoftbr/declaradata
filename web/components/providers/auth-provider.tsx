'use client'

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { User } from '@/lib/api'

const ACCESS_TOKEN_STORAGE_KEY = 'dd_access_token'

type AuthState = {
  accessToken: string | null
  user: User | null
  isInitializing: boolean
}

type AuthContextValue = AuthState & {
  setAccessToken: (token: string | null) => void
  getAccessToken: () => string | null
  refreshAccessToken: () => Promise<string | null>
  isAuthenticated: boolean
  setUser: (user: User | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({
  children,
  initialAccessToken = null,
}: {
  children: ReactNode
  initialAccessToken?: string | null
}) {
  const [accessToken, setAccessTokenState] = useState<string | null>(initialAccessToken)
  const [user, setUser] = useState<User | null>(null)
  // Verdadeiro enquanto ainda não sabemos se a sessão pode ser recuperada do cookie
  const [isInitializing, setIsInitializing] = useState(!initialAccessToken)
  const tokenRef = useRef<string | null>(initialAccessToken)
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null)
  // Strict Mode (dev) monta/desmonta/monta os efeitos duas vezes.
  // Com ROTATE_REFRESH_TOKENS+BLACKLIST a segunda chamada recebe 401 (token já rotacionado).
  // Este ref garante que initAuth execute uma única vez por ciclo de vida real.
  const initCalledRef = useRef(false)
  // Garante que a busca do usuário ocorra apenas uma vez por token.
  const userFetchStartedRef = useRef(false)
  // Evita retentativas rápidas em caso de erro 429/500
  const lastFetchErrorTimeRef = useRef<number>(0)

  const setAccessToken = useCallback((token: string | null) => {
    if (typeof window !== 'undefined') {
      if (token) {
        window.sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token)
      } else {
        window.sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
      }
    }
    tokenRef.current = token
    setAccessTokenState(token)
    // Se o token mudou (especialmente se limpou), resetamos o flag de busca
    if (!token) {
      userFetchStartedRef.current = false
      lastFetchErrorTimeRef.current = 0
    }
  }, [])

  const getAccessToken = useCallback(() => tokenRef.current, [])

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    // Deduplica chamadas simultâneas — reutiliza a Promise em andamento
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current
    }

    const promise = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' })

        if (res.ok) {
          const { access } = (await res.json()) as { access: string }
          setAccessToken(access)
          return access
        }

        // Só invalida a sessão em falha explícita de autenticação (401/403).
        // Erros de servidor (5xx) ou falhas de rede durante restart do dev
        // não devem deslogar o usuário.
        if (res.status === 401 || res.status === 403) {
          setAccessToken(null)
          setUser(null)
        }
        return null
      } catch {
        // Erro de rede (servidor offline, restart) — mantém estado atual
        return null
      } finally {
        refreshPromiseRef.current = null
      }
    })()

    refreshPromiseRef.current = promise
    return promise
  }, [setAccessToken])

  // Tenta recuperar a sessão ao carregar a página/app
  useEffect(() => {
    if (initCalledRef.current) return
    initCalledRef.current = true

    const initAuth = async () => {
      if (!tokenRef.current && typeof window !== 'undefined') {
        const stored = window.sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
        if (stored) {
          // Sessão ativa na mesma janela — usa o token guardado.
          // Se estiver expirado, o useApi renova no próximo 401.
          setAccessToken(stored)
        }
      }

      // sessionStorage vazio = browser foi fechado/reaberto.
      // Não faz auto-refresh; exige novo login explícito.
      setIsInitializing(false)
    }
    initAuth()
  }, [setAccessToken])

  // Busca dados do usuário quando o token aparece pela primeira vez
  useEffect(() => {
    if (accessToken && !user && !userFetchStartedRef.current) {
      // Throttle: espera pelo menos 5 segundos após um erro antes de tentar de novo
      if (Date.now() - lastFetchErrorTimeRef.current < 5000) return

      userFetchStartedRef.current = true
      fetch('/api/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then(async res => {
          if (res.status === 401 || res.status === 403) {
            throw new Error('Unauthorized')
          }
          if (!res.ok) {
            lastFetchErrorTimeRef.current = Date.now()
            userFetchStartedRef.current = false
            return null
          }
          return res.json() as Promise<User>
        })
        .then(data => {
          if (data) setUser(data)
        })
        .catch(err => {
          userFetchStartedRef.current = false
          if (err.message === 'Unauthorized') {
            setAccessToken(null)
            setUser(null)
          } else {
            lastFetchErrorTimeRef.current = Date.now()
          }
        })
    }
  }, [accessToken, user, setAccessToken])

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        user,
        isInitializing,
        setAccessToken,
        getAccessToken,
        refreshAccessToken,
        isAuthenticated: accessToken !== null,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
