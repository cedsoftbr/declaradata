'use client'

import * as XLSX from 'xlsx'
import { z } from 'zod'
import { ExcelImportModal } from '@/components/excel-import-modal'
import { useApi } from '@/hooks/use-api'
import type { ImportExcelResponse } from '@/lib/api-client'
import { normalizeExcelRow } from '@/lib/utils'

const NcmRowSchema = z.object({
  ncm: z.preprocess(
    v => (v == null ? '' : String(v).trim().replace(/\D/g, '')),
    z.string().regex(/^\d{8}$/, 'NCM deve ter exatamente 8 dígitos.')
  ),
})

type NcmRow = z.infer<typeof NcmRowSchema>

interface NcmImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function NcmImportModal({ open, onOpenChange, onSuccess }: NcmImportModalProps) {
  const { call } = useApi()

  const handleImport = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    const res = await call('/api/products/ncm-catalog/import-excel/', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      throw new Error(error.detail || error.message || 'Erro ao importar NCMs.')
    }

    return (await res.json()) as ImportExcelResponse
  }

  const validate = (data: unknown[]) => {
    if (data.length === 0) {
      return { validRows: [], errors: [], layoutError: 'A planilha está vazia.' }
    }

    const firstRow = normalizeExcelRow(data[0])
    if (!('ncm' in firstRow)) {
      return {
        validRows: [],
        errors: [],
        layoutError: 'Coluna obrigatória ausente: ncm',
      }
    }

    const validRows: NcmRow[] = []
    const errors: { line: number; message: string }[] = []

    for (const [index, rawRow] of data.entries()) {
      const result = NcmRowSchema.safeParse(normalizeExcelRow(rawRow))
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
    const data = [{ ncm: '12345678' }, { ncm: '87654321' }]
    const worksheet = XLSX.utils.json_to_sheet(data)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'NCMs')
    XLSX.writeFile(workbook, 'modelo_ncm.xlsx')
  }

  return (
    <ExcelImportModal
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
      title="Importar NCMs via Excel"
      onImport={handleImport}
      onDownloadTemplate={downloadTemplate}
      onValidate={validate}
      requireCompanySelection={false}
    />
  )
}
