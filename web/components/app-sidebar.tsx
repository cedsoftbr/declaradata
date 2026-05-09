'use client'

import {
  Building2,
  Contact,
  CreditCard,
  FileStack,
  FileText,
  LayoutDashboard,
  MapPin,
  PackageSearch,
  Receipt,
  Tags,
  UserCog,
} from 'lucide-react'
import type * as React from 'react'

import { NavMain } from '@/components/nav-main'
import { NavUser } from '@/components/nav-user'
import { useAuth } from '@/components/providers/auth-provider'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { UsageCard } from '@/components/usage-card'
import { usePermissions } from '@/hooks/use-permissions'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth()
  const { can } = usePermissions()

  const isSuperUser = user?.profile === 'superadmin'
  const isAdminCompany = user?.profile === 'admin'

  const getMenuItems = () => {
    if (isSuperUser) {
      return [
        { title: 'Dashboard', url: '/', icon: LayoutDashboard },
        { title: 'Empresas', url: '/companies', icon: Building2 },
        { title: 'Usuários', url: '/users', icon: UserCog },
        { title: 'Cidades', url: '/locations', icon: MapPin },
        { title: 'NCM', url: '/catalog', icon: Tags },
        { title: 'Planos', url: '/billing/plans', icon: CreditCard },
        { title: 'Faturas', url: '/billing/invoices', icon: Receipt },
      ]
    }

    const items = []
    if (can('dce')) items.push({ title: 'DCe', url: '/shipments', icon: FileStack })
    if (can('persons')) items.push({ title: 'Pessoas', url: '/persons', icon: Contact })
    if (can('products'))
      items.push({ title: 'Produtos', url: '/products', icon: PackageSearch })
    if (isAdminCompany) items.push({ title: 'Usuários', url: '/users', icon: UserCog })

    return items
  }

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader className="p-2 pb-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-foreground text-background shrink-0">
                <FileText className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="text-sm font-bold uppercase tracking-tight">
                  INTEGRADATA
                </span>
                <span className="text-[11px] text-muted-foreground tracking-wide">
                  DECLARAÇÃO DE CONTEÚDO
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {/* Card de Consumo (Apenas para usuários de empresa) */}
        {!isSuperUser && (
          <div className="mt-6 mb-1">
            <UsageCard />
          </div>
        )}

        <div className="mt-1">
          <NavMain items={getMenuItems()} />
        </div>
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
