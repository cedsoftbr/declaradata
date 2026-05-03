'use client'

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface CancelShipmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reason: string
  onReasonChange: (value: string) => void
  onConfirm: () => void
  isLoading?: boolean
}

export function CancelShipmentDialog({
  open,
  onOpenChange,
  reason = '',
  onReasonChange,
  onConfirm,
  isLoading = false,
}: CancelShipmentDialogProps) {
  const size = (reason || '').trim().length
  const isValid = size >= 15 && size <= 255

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar Emissão</DialogTitle>
          <DialogDescription>
            Informe a justificativa do cancelamento. Mínimo de 15 caracteres.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="cancel-reason">Justificativa</Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={e => onReasonChange(e.target.value)}
            rows={4}
            maxLength={255}
            className="resize-y"
          />
          <p className="text-xs text-muted-foreground">
            {size}/255 caracteres (mínimo 15)
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Voltar
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!isValid || isLoading}
          >
            {isLoading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            Confirmar Cancelamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
