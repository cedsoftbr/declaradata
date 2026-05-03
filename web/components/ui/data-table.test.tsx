import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DataTable } from './data-table'

describe('Component: DataTable', () => {
  const columns = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'name', header: 'Nome' },
  ]

  const data = [
    { id: 1, name: 'Teste 1' },
    { id: 2, name: 'Teste 2' },
  ]

  it('should render headers and data correctly', () => {
    render(<DataTable columns={columns} data={data} />)

    expect(screen.getByText('ID')).toBeInTheDocument()
    expect(screen.getByText('Nome')).toBeInTheDocument()
    expect(screen.getByText('Teste 1')).toBeInTheDocument()
    expect(screen.getByText('Teste 2')).toBeInTheDocument()
  })

  it('should show empty message when no data is provided', () => {
    render(<DataTable columns={columns} data={[]} />)
    expect(screen.getByText(/nenhum resultado encontrado/i)).toBeInTheDocument()
  })
})
