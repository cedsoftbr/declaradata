'use client'

import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'

type NavItem = {
  title: string
  url: string
  icon?: LucideIcon
  isActive?: boolean
  items?: { title: string; url: string }[]
}

function NavMenuItem({ item }: { item: NavItem }) {
  const pathname = usePathname()
  const hasItems = item.items && item.items.length > 0
  const isParentActive =
    item.url === '/' ? pathname === '/' : pathname.startsWith(item.url)
  const isChildActive = item.items?.some(subItem => pathname === subItem.url)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isParentActive || isChildActive}
        tooltip={item.title}
        render={hasItems ? undefined : <Link href={item.url} />}
      >
        {item.icon && <item.icon />}
        <span>{item.title}</span>
      </SidebarMenuButton>

      {hasItems && (
        <SidebarMenuSub>
          {item.items?.map(subItem => (
            <SidebarMenuSubItem key={subItem.title}>
              <SidebarMenuSubButton
                isActive={pathname === subItem.url}
                render={<Link href={subItem.url} />}
              >
                <span>{subItem.title}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  )
}

export function NavMain({ label, items }: { label?: string; items: NavItem[] }) {
  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarMenu>
        {items.map(item => (
          <NavMenuItem key={item.title} item={item} />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
