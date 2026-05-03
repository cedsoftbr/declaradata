import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DeleteShipmentDialog } from './delete-shipment-dialog'

describe('DeleteShipmentDialog', () => {
  it('renders when open', () => {
    render(
      <DeleteShipmentDialog open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} />
    )
    expect(screen.getByText('Excluir emissão')).toBeInTheDocument()
    expect(
      screen.getByText(/Esta ação é permanente e não pode ser desfeita/)
    ).toBeInTheDocument()
  })

  it('does not render content when closed', () => {
    render(
      <DeleteShipmentDialog open={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} />
    )
    expect(screen.queryByText('Excluir emissão')).not.toBeInTheDocument()
  })

  it('calls onConfirm when delete button is clicked', () => {
    const onConfirm = vi.fn()
    render(
      <DeleteShipmentDialog open={true} onOpenChange={vi.fn()} onConfirm={onConfirm} />
    )
    fireEvent.click(screen.getByRole('button', { name: /excluir/i }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onOpenChange(false) when cancel button is clicked', () => {
    const onOpenChange = vi.fn()
    render(
      <DeleteShipmentDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('disables both buttons and shows spinner when isLoading', () => {
    render(
      <DeleteShipmentDialog
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isLoading={true}
      />
    )
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /excluir/i })).toBeDisabled()
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })
})
