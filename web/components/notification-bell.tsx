'use client'

import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bell, BellDot, Check } from 'lucide-react'
import { useNotifications } from '@/components/providers/notification-provider'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, clearNotifications } =
    useNotifications()

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'relative rounded-full'
        )}
      >
        {unreadCount > 0 ? (
          <BellDot className="size-5 text-primary animate-pulse" />
        ) : (
          <Bell className="size-5 text-muted-foreground" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {unreadCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 rounded-2xl shadow-xl border-muted-foreground/20"
        align="end"
      >
        <div className="flex items-center justify-between p-4 bg-muted/20">
          <h4 className="font-bold text-sm tracking-tight flex items-center gap-2">
            Notificações
            {unreadCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-bold">
                {unreadCount} novas
              </Badge>
            )}
          </h4>
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearNotifications}
              className="h-8 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors"
            >
              Limpar tudo
            </Button>
          )}
        </div>
        <Separator />
        <ScrollArea className="h-80">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-2">
              <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center">
                <Bell className="size-6 text-muted-foreground/50" />
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                Nenhuma notificação por enquanto.
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map(n => (
                <div
                  key={n.id}
                  className={cn(
                    'p-4 transition-colors hover:bg-muted/30 relative group border-b last:border-0',
                    !n.read && 'bg-primary/5'
                  )}
                >
                  {!n.read && (
                    <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-full" />
                  )}
                  <div className="flex justify-between gap-2">
                    <div className="space-y-1 pr-4">
                      <p className="text-xs font-bold leading-tight">{n.title}</p>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {n.message}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60">
                        {formatDistanceToNow(n.timestamp, {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </p>
                      {n.action && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 mt-2 text-[10px] font-bold rounded-lg bg-primary/10 border-primary/20 hover:bg-primary/20 text-primary"
                          onClick={() => {
                            n.action?.onClick()
                            markAsRead(n.id)
                          }}
                        >
                          {n.action.label}
                        </Button>
                      )}
                    </div>
                    {!n.read && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6 rounded-full shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => markAsRead(n.id)}
                        title="Marcar como lida"
                      >
                        <Check className="size-3 text-primary" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
