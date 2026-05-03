'use client'

import * as XLSX from 'xlsx'
import { z } from 'zod'
import { ExcelImportModal } from '@/components/excel-import-modal'
import { useApi } from '@/hooks/use-api'
import type { ImportExcelResponse } from '@/lib/api-client'
import { normalizeExcelRow } from '@/lib/utils'

// ── Schema Zod para cada linha da planilha de produtos ───────────────────────

const ProductRowSchema = z.object({
  descricao: z.preprocess(
    v => (v == null ? '' : String(v).trim()),
    z.string().min(1, 'Descrição ausente.')
  ),
  ncm: z.preprocess(
    v => (v == null ? '' : String(v).trim().replace(/\D/g, '')),
    z.string().regex(/^\d{8}$/, 'NCM deve ter exatamente 8 dígitos.')
  ),
})

type ProductRow = z.infer<typeof ProductRowSchema>

interface ProductImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function ProductImportModal({
  open,
  onOpenChange,
  onSuccess,
}: ProductImportModalProps) {
  const { call } = useApi()

  const handleImport = async (file: File, companyId?: number) => {
    const formData = new FormData()
    formData.append('file', file)
    if (companyId) formData.append('company_id', String(companyId))

    const res = await call('/api/products/products/import-excel/', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      throw new Error(error.detail || error.message || 'Erro ao importar produtos.')
    }

    return (await res.json()) as ImportExcelResponse
  }

  const validate = (data: unknown[]) => {
    if (data.length === 0) {
      return { validRows: [], errors: [], layoutError: 'A planilha está vazia.' }
    }

    const firstRow = normalizeExcelRow(data[0])
    const missing = ['descricao', 'ncm'].filter(h => !(h in firstRow))
    if (missing.length > 0) {
      return {
        validRows: [],
        errors: [],
        layoutError: `Colunas obrigatórias ausentes: ${missing.join(', ')}`,
      }
    }

    const validRows: ProductRow[] = []
    const errors: { line: number; message: string }[] = []

    for (const [index, rawRow] of data.entries()) {
      const result = ProductRowSchema.safeParse(normalizeExcelRow(rawRow))
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
      { descricao: 'Produto Exemplo 1', ncm: '12345678' },
      { descricao: 'Produto Exemplo 2', ncm: '87654321' },
    ]
    const worksheet = XLSX.utils.json_to_sheet(data)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Produtos')
    XLSX.writeFile(workbook, 'modelo_produtos.xlsx')
  }

  return (
    <ExcelImportModal
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
      title="Importar Produtos via Excel"
      onImport={handleImport}
      onDownloadTemplate={downloadTemplate}
      onValidate={validate}
      requireCompanySelection={true}
    />
  )
}
