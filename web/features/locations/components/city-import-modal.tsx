'use client'

import * as XLSX from 'xlsx'
import { z } from 'zod'
import { ExcelImportModal } from '@/components/excel-import-modal'
import { useApi } from '@/hooks/use-api'
import type { ImportExcelResponse } from '@/lib/api-client'
import { normalizeExcelRow } from '@/lib/utils'

const BRAZILIAN_STATES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
]

// ── Schema Zod para cada linha da planilha de cidades ───────────────────────

const CityRowSchema = z.object({
  cidade: z.preprocess(
    v => (v == null ? '' : String(v).trim()),
    z.string().min(1, 'Nome da cidade ausente.')
  ),
  uf: z.preprocess(
    v => (v == null ? '' : String(v).trim().toUpperCase()),
    z.string().refine(uf => BRAZILIAN_STATES.includes(uf), {
      message: 'UF inválida.',
    })
  ),
  ibge: z.preprocess(
    v => (v == null ? '' : String(v).trim().replace(/\D/g, '')),
    z.string().regex(/^\d{7}$/, 'Código IBGE deve ter exatamente 7 dígitos.')
  ),
})

type CityRow = z.infer<typeof CityRowSchema>

interface CityImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function CityImportModal({
  open,
  onOpenChange,
  onSuccess,
}: CityImportModalProps) {
  const { call } = useApi()

  const handleImport = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    const res = await call('/api/locations/cities/import-excel/', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      throw new Error(error.detail || error.message || 'Erro ao importar cidades.')
    }

    return (await res.json()) as ImportExcelResponse
  }

  const validate = (data: unknown[]) => {
    if (data.length === 0) {
      return { validRows: [], errors: [], layoutError: 'A planilha está vazia.' }
    }

    const firstRow = normalizeExcelRow(data[0])
    const missing = ['cidade', 'uf', 'ibge'].filter(h => !(h in firstRow))
    if (missing.length > 0) {
      return {
        validRows: [],
        errors: [],
        layoutError: `Colunas obrigatórias ausentes: ${missing.join(', ')}`,
      }
    }

    const validRows: CityRow[] = []
    const errors: { line: number; message: string }[] = []

    for (const [index, rawRow] of data.entries()) {
      const result = CityRowSchema.safeParse(normalizeExcelRow(rawRow))
      if (result.success) {
        validRows.push(result.data)
      } else {
        errors.push({
          line: index + 2,
          message: result.error.errors.map(e => e.message).join('; '),
        })
      }
    }

    return { validRows, errors }
  }

  const downloadTemplate = () => {
    const data = [
      { cidade: 'São Paulo', uf: 'SP', ibge: '3550308' },
      { cidade: 'Rio de Janeiro', uf: 'RJ', ibge: '3304557' },
    ]
    const worksheet = XLSX.utils.json_to_sheet(data)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cidades')
    XLSX.writeFile(workbook, 'modelo_cidades.xlsx')
  }

  return (
    <ExcelImportModal
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
      title="Importar Cidades via Excel"
      onImport={handleImport}
      onDownloadTemplate={downloadTemplate}
      onValidate={validate}
      requireCompanySelection={false}
    />
  )
}
