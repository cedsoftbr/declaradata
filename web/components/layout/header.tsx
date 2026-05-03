'use client'

import { MessageSquare } from 'lucide-react'
import { usePathname } from 'next/navigation'
import * as React from 'react'
import { NotificationBell } from '@/components/notification-bell'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

const routeMap: Record<string, string> = {
  companies: 'Empresas',
  persons: 'Pessoas',
  users: 'Usuários',
  products: 'Produtos',
  locations: 'Localizações',
  cities: 'Cidades',
  billings: 'Financeiro',
  plans: 'Planos',
  invoices: 'Faturas',
  dce: 'DCE',
  shipments: 'DCE',
  profile: 'Meu Perfil',
  new: 'Novo',
  edit: 'Editar',
  settings: 'Configurações',
  certificate: 'Certificado',
  dashboard: 'Dashboard',
  termos: 'Termos',
  privacidade: 'Privacidade',
}

export function Header() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  const formattedSegments = segments
    .map((segment, index) => {
      const isIdSegment = /^\d+$/.test(segment) || uuidRegex.test(segment)
      if (isIdSegment) return null

      const title =
        routeMap[segment] ??
        segment
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')

      return {
        href: `/${segments.slice(0, index + 1).join('/')}`,
        title,
      }
    })
    .filter(Boolean) as { href: string; title: string }[]
  const lastSegment = segments[segments.length - 1]
  const endsWithIdSegment =
    !!lastSegment && (/^\d+$/.test(lastSegment) || uuidRegex.test(lastSegment))
  const breadcrumbSegments = endsWithIdSegment
    ? [...formattedSegments, { href: pathname, title: 'Detalhes' }]
    : formattedSegments

  return (
    <header className="flex h-16 shrink-0 items-center justify-between px-4 border-b sticky top-0 bg-background z-10">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbSegments.length === 0 ? (
              <BreadcrumbItem>
                <BreadcrumbPage>Dashboard</BreadcrumbPage>
              </BreadcrumbItem>
            ) : (
              breadcrumbSegments.map((segment, index) => {
                const isLast = index === breadcrumbSegments.length - 1

                return (
                  <React.Fragment key={segment.href}>
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage>{segment.title}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink href={segment.href}>
                          {segment.title}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {!isLast && <BreadcrumbSeparator className="hidden md:block" />}
                  </React.Fragment>
                )
              })
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-full">
          <MessageSquare className="size-5 text-muted-foreground" />
        </Button>
        <NotificationBell />
      </div>
    </header>
  )
}
