'use client'

import {
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  Sun,
  User as UserIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import * as React from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

export function NavUser() {
  const { isMobile } = useSidebar()
  const router = useRouter()
  const { accessToken, setAccessToken, user, setUser } = useAuth()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  // Avoid hydration mismatch
  React.useEffect(() => {
    setMounted(true)
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
    setAccessToken(null)
    setUser(null)
    router.push('/auth/login')
  }

  // Lógica para ciclar os temas: Light -> Dark -> System -> Light
  const toggleTheme = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const getThemeIcon = () => {
    if (!mounted) return <Monitor className="size-4" />
    if (theme === 'light') return <Sun className="size-4" />
    if (theme === 'dark') return <Moon className="size-4" />
    return <Monitor className="size-4" />
  }

  const getThemeLabel = () => {
    if (!mounted) return 'Auto'
    if (theme === 'light') return 'Claro'
    if (theme === 'dark') return 'Escuro'
    return 'Auto'
  }

  const displayName = React.useMemo(() => {
    if (!user) return 'Usuário'
    const first = user.first_name || ''
    const last = user.last_name || ''
    if (!first && !last) return user.email.split('@')[0]
    return `${first} ${last}`.trim()
  }, [user])

  const initials = React.useMemo(() => {
    if (!user) return 'U'
    const first = user.first_name || user.email || 'U'
    return first[0].toUpperCase()
  }, [user])

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />}
          >
            <Avatar className="h-9 w-9 rounded-lg border">
              <AvatarFallback className="rounded-lg text-sm bg-background font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left leading-tight ml-1">
              <span className="truncate font-bold text-sm tracking-tight">
                {displayName}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-48 rounded-xl p-1 shadow-md border"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={8}
          >
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => router.push('/profile')}
                className="flex items-center gap-2 w-full px-2 py-2 hover:bg-muted rounded-lg transition-colors group text-left"
              >
                <div className="flex size-7 items-center justify-center rounded-md border bg-background group-hover:bg-foreground group-hover:text-background transition-colors text-muted-foreground">
                  <UserIcon className="size-4" />
                </div>
                <span className="text-xs font-medium">Perfil</span>
              </button>

              <button
                type="button"
                onClick={toggleTheme}
                className="flex items-center gap-2 w-full px-2 py-2 hover:bg-muted rounded-lg transition-colors group text-left"
              >
                <div className="flex size-7 items-center justify-center rounded-md border bg-background group-hover:bg-foreground group-hover:text-background transition-colors text-muted-foreground">
                  {getThemeIcon()}
                </div>
                <span className="text-xs font-medium">Tema: {getThemeLabel()}</span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 w-full px-2 py-2 hover:bg-muted rounded-lg transition-colors group text-left"
              >
                <div className="flex size-7 items-center justify-center rounded-md border bg-background group-hover:bg-foreground group-hover:text-background transition-colors text-muted-foreground">
                  <LogOut className="size-4" />
                </div>
                <span className="text-xs font-medium">Sair</span>
              </button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
