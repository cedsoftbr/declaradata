'use client'

import * as XLSX from 'xlsx'
import { z } from 'zod'
import { ExcelImportModal } from '@/components/excel-import-modal'
import { useApi } from '@/hooks/use-api'
import type { ImportExcelResponse } from '@/lib/api-client'
import { normalizeExcelRow } from '@/lib/utils'

// ── Schema Zod para cada linha da planilha de pessoas ────────────────────────

const str = (v: unknown) => (v == null ? '' : String(v).trim())
const digits = (v: unknown) => (v == null ? '' : String(v).trim().replace(/\D/g, ''))

const PersonRowSchema = z.object({
  nome: z.preprocess(str, z.string().min(1, 'Nome ausente.')),
  documento: z.preprocess(
    digits,
    z.string().refine(d => d.length === 11 || d.length === 14, {
      message: 'Documento deve ter 11 ou 14 dígitos.',
    })
  ),
  tipo: z.preprocess(
    v => (v == null ? '' : String(v).trim().toLowerCase()),
    z.enum(['cliente', 'transportador'], {
      errorMap: () => ({ message: 'Tipo deve ser "cliente" ou "transportador".' }),
    })
  ),
  ibge: z.preprocess(digits, z.string().length(7, 'IBGE deve ter 7 dígitos.')),
  cep: z.preprocess(digits, z.string().length(8, 'CEP deve ter 8 dígitos.')),
  logradouro: z.preprocess(str, z.string()),
  numero: z.preprocess(str, z.string()),
  complemento: z.preprocess(str, z.string()),
  bairro: z.preprocess(str, z.string()),
  ie: z.preprocess(str, z.string()),
  im: z.preprocess(str, z.string()),
})

type PersonRow = z.infer<typeof PersonRowSchema>

interface PersonImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function PersonImportModal({
  open,
  onOpenChange,
  onSuccess,
}: PersonImportModalProps) {
  const { call } = useApi()

  const handleImport = async (file: File, companyId?: number) => {
    const formData = new FormData()
    formData.append('file', file)
    if (companyId) formData.append('company_id', String(companyId))

    const res = await call('/api/persons/persons/import-excel/', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      throw new Error(error.detail || error.message || 'Erro ao importar pessoas.')
    }

    return (await res.json()) as ImportExcelResponse
  }

  const validate = (data: unknown[]) => {
    if (data.length === 0) {
      return { validRows: [], errors: [], layoutError: 'A planilha está vazia.' }
    }

    // Verifica colunas obrigatórias (case-insensitive)
    const firstRow = normalizeExcelRow(data[0])
    const required = [
      'nome',
      'documento',
      'tipo',
      'ibge',
      'cep',
      'logradouro',
      'numero',
      'bairro',
    ]
    const missing = required.filter(h => !(h in firstRow))
    if (missing.length > 0) {
      return {
        validRows: [],
        errors: [],
        layoutError: `Colunas obrigatórias ausentes: ${missing.join(', ')}`,
      }
    }

    const validRows: PersonRow[] = []
    const errors: { line: number; message: string }[] = []

    for (const [index, rawRow] of data.entries()) {
      const result = PersonRowSchema.safeParse(normalizeExcelRow(rawRow))
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
      {
        nome: 'João Silva',
        documento: '12345678901',
        tipo: 'cliente',
        ie: '',
        im: '',
        cep: '01001000',
        logradouro: 'Praça da Sé',
        numero: '100',
        complemento: 'Apto 10',
        bairro: 'Sé',
        ibge: '3550308',
      },
      {
        nome: 'Empresa Exemplo',
        documento: '12345678000195',
        tipo: 'cliente',
        ie: '123456789',
        im: '',
        cep: '01001000',
        logradouro: 'Avenida das Industrias',
        numero: '1000',
        complemento: 'Bloco B',
        bairro: 'Distrito',
        ibge: '3550308',
      },
    ]
    const worksheet = XLSX.utils.json_to_sheet(data)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pessoas')
    XLSX.writeFile(workbook, 'modelo_pessoas.xlsx')
  }

  return (
    <ExcelImportModal
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
      title="Importar Pessoas via Excel"
      onImport={handleImport}
      onDownloadTemplate={downloadTemplate}
      onValidate={validate}
      requireCompanySelection={true}
    />
  )
}
