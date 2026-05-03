'use client'

import {
  Ban,
  ChevronDown,
  Copy,
  Eye,
  FileJson,
  FileText,
  Pencil,
  SendHorizonal,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TableCell, TableRow } from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { ShipmentListItem } from '@/lib/api'
import { cn } from '@/lib/utils'

interface ShipmentRowProps {
  shipment: ShipmentListItem
  isSelected: boolean
  onToggleSelect: (id: string) => void
  onRemove: (id: string) => void
  onCancel: (id: string) => void
  onNavigate: (id: string) => void
  onEmit: (id: string) => void
  onDownloadPdf: (id: string) => void
  onDownloadXml: (id: string) => void
  onDuplicate: (id: string) => void
  isCancelling?: boolean
  isEmitting?: boolean
  disableEmit?: boolean
  statusBadge: Record<string, string>
  statusLabel: Record<string, string>
}

function ActionButtons({
  d,
  isEditable,
  isEmitting,
  disableEmit,
  isCancelling,
  onNavigate,
  onEmit,
  onDownloadPdf,
  onDownloadXml,
  onDuplicate,
  onCancel,
  onRemove,
}: {
  d: ShipmentListItem
  isEditable: boolean
  isEmitting: boolean
  disableEmit: boolean
  isCancelling: boolean
  onNavigate: (id: string) => void
  onEmit: (id: string) => void
  onDownloadPdf: (id: string) => void
  onDownloadXml: (id: string) => void
  onDuplicate: (id: string) => void
  onCancel: (id: string) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="flex items-center justify-end">
      <div className="inline-flex items-center rounded-md border border-muted-foreground/20 bg-background shadow-xs">
        <Button
          variant="ghost"
          size="icon"
          title={isEditable ? 'Editar DCe' : 'Ver Detalhes'}
          className="size-8 rounded-r-none text-muted-foreground hover:text-primary"
          onClick={() => onNavigate(d.id)}
        >
          {isEditable ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon' }),
              'size-8 rounded-l-none border-l border-muted-foreground/20 text-muted-foreground hover:text-primary'
            )}
          >
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {isEditable && (
              <DropdownMenuItem
                onClick={() => onEmit(d.id)}
                disabled={isEmitting || disableEmit}
                className="text-primary focus:text-primary focus:bg-primary/5 font-medium"
              >
                <SendHorizonal className="mr-2 size-4" />
                Transmitir DCe
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onDuplicate(d.id)}>
              <Copy className="mr-2 size-4" />
              Duplicar DCe
            </DropdownMenuItem>

            {d.status === 'cancelled' && (
              <DropdownMenuItem onClick={() => onDownloadPdf(d.id)}>
                <FileText className="mr-2 size-4" />
                Baixar PDF
              </DropdownMenuItem>
            )}

            {d.status === 'authorized' && (
              <>
                <DropdownMenuItem onClick={() => onDownloadPdf(d.id)}>
                  <FileText className="mr-2 size-4" />
                  Baixar PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDownloadXml(d.id)}>
                  <FileJson className="mr-2 size-4" />
                  Baixar XML
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onCancel(d.id)}
                  disabled={isCancelling}
                  className="text-destructive focus:text-destructive focus:bg-destructive/5"
                >
                  <Ban className="mr-2 size-4" />
                  Cancelar DCe
                </DropdownMenuItem>
              </>
            )}

            {d.status === 'draft' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onRemove(d.id)}
                  className="text-destructive focus:text-destructive focus:bg-destructive/5"
                >
                  <Trash2 className="mr-2 size-4" />
                  Excluir
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Handles complex table row rendering with many conditions
export function ShipmentRow({
  shipment: d,
  isSelected: selected,
  onToggleSelect,
  onRemove,
  onCancel,
  onNavigate,
  onEmit,
  onDownloadPdf,
  onDownloadXml,
  onDuplicate,
  isCancelling = false,
  isEmitting = false,
  disableEmit = false,
  statusBadge,
  statusLabel,
}: ShipmentRowProps) {
  const isEditable = d.status === 'draft' || d.status === 'rejected'
  const displayStatus = isCancelling
    ? 'cancelling'
    : isEmitting
      ? 'processing'
      : d.status

  return (
    <TableRow
      key={d.id}
      className="hover:bg-muted/50 transition-colors"
      data-selected={selected ? true : undefined}
    >
      <TableCell className="py-3 px-4">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(d.id)}
          className="rounded-md"
        />
      </TableCell>

      {/* 1. Número (Série/Número) */}
      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
        {d.number != null
          ? `${String(d.serie).padStart(3, '0')}/${String(d.number).padStart(6, '0')}`
          : null}
        {d.tp_amb === 2 ? (
          <span className="ml-1 text-[9px] text-amber-500 font-bold border border-amber-500/30 px-1 rounded bg-amber-500/5">
            HML
          </span>
        ) : null}
        {d.tp_amb === 3 ? (
          <span className="ml-1 text-[9px] text-blue-600 font-bold border border-blue-500/30 px-1 rounded bg-blue-500/5">
            SMD
          </span>
        ) : null}
      </TableCell>

      {/* 2. Data */}
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
        {new Date(d.dh_emi ?? d.created_at).toLocaleDateString('pt-BR')}
      </TableCell>

      {/* 3. Emitente */}
      <TableCell className="max-w-[150px]">
        <div className="flex flex-col">
          <span className="font-semibold text-sm truncate" title={d.emitter_name ?? ''}>
            {d.emitter_name ?? '—'}
          </span>
        </div>
      </TableCell>

      {/* 4. Remetente */}
      <TableCell className="max-w-[150px]">
        <div className="flex flex-col">
          <span className="font-semibold text-sm truncate" title={d.sender_name ?? ''}>
            {d.sender_name ?? '—'}
          </span>
          <span className="text-[10px] text-muted-foreground truncate">
            {d.sender_city_uf ?? '—'}
          </span>
        </div>
      </TableCell>

      {/* 5. Destinatário */}
      <TableCell className="max-w-[150px]">
        <div className="flex flex-col">
          <span
            className="font-semibold text-sm truncate"
            title={d.recipient_name ?? ''}
          >
            {d.recipient_name ?? '—'}
          </span>
          <span className="text-[10px] text-muted-foreground truncate">
            {d.recipient_city_uf ?? '—'}
          </span>
        </div>
      </TableCell>

      {/* 6. Status (Penúltimo) */}
      <TableCell>
        {d.status === 'rejected' && d.rejection_reason ? (
          <TooltipProvider delay={200}>
            <Tooltip>
              <TooltipTrigger>
                <Badge
                  variant="outline"
                  className={cn('cursor-help', statusBadge[displayStatus])}
                >
                  {statusLabel[displayStatus] ?? displayStatus}
                </Badge>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="max-w-xs text-xs whitespace-pre-wrap break-words"
              >
                {d.rejection_reason}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Badge variant="outline" className={statusBadge[displayStatus]}>
            {statusLabel[displayStatus] ?? displayStatus}
          </Badge>
        )}
      </TableCell>

      {/* 7. Ações (Último) */}
      <TableCell className="text-right">
        <ActionButtons
          d={d}
          isEditable={isEditable}
          isEmitting={isEmitting}
          disableEmit={disableEmit}
          isCancelling={isCancelling}
          onNavigate={onNavigate}
          onEmit={onEmit}
          onDownloadPdf={onDownloadPdf}
          onDownloadXml={onDownloadXml}
          onDuplicate={onDuplicate}
          onCancel={onCancel}
          onRemove={onRemove}
        />
      </TableCell>
    </TableRow>
  )
}
