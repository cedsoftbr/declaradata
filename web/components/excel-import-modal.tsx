import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { useAuth } from '@/components/providers/auth-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { type Company, companiesApi } from '@/features/companies/api'
import type { ImportExcelResponse } from '@/lib/api-client'

export interface PreValidationResult {
  validRows: object[]
  errors: { line: number; message: string }[]
  layoutError?: string
}

interface ExcelImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  title: string
  onImport: (file: File, companyId?: number) => Promise<ImportExcelResponse>
  onDownloadTemplate: () => void
  onValidate?: (data: unknown[]) => PreValidationResult
  requireCompanySelection?: boolean
}

/* --- SUB-COMPONENTES PARA REDUZIR COMPLEXIDADE --- */

function StepReview({
  file,
  preValidation,
  isUploading,
  onReset,
}: {
  file: File | null
  preValidation: PreValidationResult
  isUploading: boolean
  onReset: () => void
}) {
  return (
    <div className="space-y-4 w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl border relative">
        <FileSpreadsheet className="size-5 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate text-foreground">{file?.name}</p>
          <p className="text-xs text-muted-foreground">
            Planilha analisada. {preValidation.validRows.length} linhas prontas para
            importar.
          </p>
        </div>
        {!isUploading && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              onReset()
            }}
            className="p-1.5 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title="Remover arquivo"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
          Erros
        </p>
        {preValidation.layoutError ? (
          <p className="text-[11px] text-destructive flex items-start gap-2 bg-destructive/5 p-2 rounded-lg border border-destructive/10">
            <AlertTriangle className="size-3 shrink-0 mt-0.5" />
            <span>Erro de Layout: {preValidation.layoutError}</span>
          </p>
        ) : preValidation.errors.length > 0 ? (
          <div className="max-h-[120px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {preValidation.errors.map(err => (
              <p
                key={err.line}
                className="text-[11px] text-muted-foreground flex items-start gap-2 bg-muted/20 p-1.5 rounded-lg"
              >
                <AlertTriangle className="size-3 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  Linha {err.line}: {err.message}
                </span>
              </p>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-green-600 flex items-center gap-2 bg-green-500/5 p-2 rounded-lg border border-green-500/10">
            <CheckCircle2 className="size-3 shrink-0" />
            <span>Sem erros de formatação detectados</span>
          </p>
        )}
      </div>
    </div>
  )
}

function StepUpload({
  showCompanySelect,
  selectedCompanyId,
  setSelectedCompanyId,
  loadingCompanies,
  isProcessing,
  companies,
  isDragging,
  setIsDragging,
  fileInputRef,
  onFileSelect,
  onDownloadTemplate,
}: {
  showCompanySelect: boolean
  selectedCompanyId: string
  setSelectedCompanyId: (v: string) => void
  loadingCompanies: boolean
  isProcessing: boolean
  companies: Company[]
  isDragging: boolean
  setIsDragging: (v: boolean) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFileSelect: (f: File) => void
  onDownloadTemplate: () => void
}) {
  return (
    <div className="space-y-4 w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
      {showCompanySelect && (
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
            Empresa Destino
          </label>
          <select
            value={selectedCompanyId}
            onChange={e => setSelectedCompanyId(e.target.value)}
            disabled={loadingCompanies || isProcessing}
            className="w-full h-10 px-3 rounded-xl border bg-background shadow-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm disabled:opacity-50"
          >
            <option value="">Selecione uma empresa...</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        type="button"
        className={`w-full border-2 border-dashed rounded-2xl py-10 px-8 text-center space-y-3 transition-all cursor-pointer ${
          isDragging
            ? 'border-foreground bg-foreground/5 scale-[1.02]'
            : 'border-muted-foreground/20 hover:bg-muted/30'
        }`}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (!isProcessing) fileInputRef.current?.click()
          }
        }}
        onDragOver={e => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setIsDragging(false)
          const f = e.dataTransfer.files?.[0]
          if (f) onFileSelect(f)
        }}
      >
        {isProcessing ? (
          <div className="space-y-3 py-2">
            <Loader2 className="size-6 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">
              Analisando dados...
            </p>
          </div>
        ) : (
          <>
            <div className="p-3 rounded-full w-fit mx-auto bg-muted/50">
              <Upload className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {isDragging
                  ? 'Solte a planilha aqui'
                  : 'Clique ou arraste a planilha aqui'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Formato suportado: .xlsx ou .xls
              </p>
            </div>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx, .xls"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) onFileSelect(f)
          }}
        />
      </button>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onDownloadTemplate}
          className="text-[11px] text-muted-foreground font-bold hover:text-foreground hover:underline flex items-center gap-1 cursor-pointer transition-colors"
        >
          <Download className="size-3" />
          Baixar modelo Excel
        </button>
      </div>
    </div>
  )
}

/* --- COMPONENTE PRINCIPAL --- */

export function ExcelImportModal({
  open,
  onOpenChange,
  onSuccess,
  title,
  onImport,
  onDownloadTemplate,
  onValidate,
  requireCompanySelection = false,
}: ExcelImportModalProps) {
  const { user, accessToken: token } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isProcessing, setIsProcessing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const [file, setFile] = useState<File | null>(null)
  const [preValidation, setPreValidation] = useState<PreValidationResult | null>(null)

  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [loadingCompanies, setLoadingCompanies] = useState(false)

  const isSuperAdmin = !!(user?.is_superuser || user?.is_staff)
  const showCompanySelect = isSuperAdmin && requireCompanySelection

  const handleReset = useCallback(() => {
    setFile(null)
    setPreValidation(null)
    setIsDragging(false)
    setSelectedCompanyId('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  useEffect(() => {
    if (!open) handleReset()
  }, [open, handleReset])

  useEffect(() => {
    if (open && showCompanySelect && token) {
      setLoadingCompanies(true)
      companiesApi
        .list(token)
        .then(res => setCompanies(res.results))
        .catch(() => toast.error('Erro ao carregar empresas.'))
        .finally(() => setLoadingCompanies(false))
    }
  }, [open, showCompanySelect, token])

  const processFile = useCallback(
    (f: File) => {
      const isExcel =
        f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls')
      if (!isExcel) {
        toast.error('Por favor, selecione um arquivo Excel (.xlsx ou .xls).')
        return
      }

      setFile(f)
      if (!onValidate) {
        setPreValidation({ validRows: [{}], errors: [] })
        return
      }

      setIsProcessing(true)
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: 'array' })
          const worksheet = workbook.Sheets[workbook.SheetNames[0]]
          const jsonData = XLSX.utils.sheet_to_json<unknown>(worksheet)
          setPreValidation(onValidate(jsonData))
        } catch {
          toast.error('Erro ao processar o arquivo Excel.')
          setFile(null)
        } finally {
          setIsProcessing(false)
        }
      }
      reader.readAsArrayBuffer(f)
    },
    [onValidate]
  )

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: binary file generation and server sync logic
  const handleConfirm = async () => {
    if (!preValidation || preValidation.validRows.length === 0) return
    if (showCompanySelect && !selectedCompanyId) {
      toast.error('Por favor, selecione uma empresa.')
      return
    }

    setIsUploading(true)
    try {
      const worksheet = XLSX.utils.json_to_sheet(preValidation.validRows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data')
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      const finalFile = new File([excelBuffer], 'import.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      const res = await onImport(
        finalFile,
        selectedCompanyId ? Number(selectedCompanyId) : undefined
      )

      const successCount = res.created + res.updated
      const errorCount = res.errors?.length || 0

      if (errorCount === 0) {
        toast.success(`Importação concluída: ${successCount} registros.`)
      } else {
        toast.warning(`Importação: ${successCount} sucessos, ${errorCount} erros.`)
      }

      onOpenChange(false)
      setTimeout(onSuccess, 100)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao importar.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-2xl border shadow-lg p-0 overflow-hidden outline-none">
        <DialogHeader className="p-6 bg-muted/30 border-b">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-background rounded-lg border shadow-sm text-foreground">
              <FileSpreadsheet className="size-5" />
            </div>
            <DialogTitle className="text-lg font-bold tracking-tight">
              {title}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-6 min-h-[260px] flex flex-col justify-start relative">
          {preValidation ? (
            <StepReview
              file={file}
              preValidation={preValidation}
              isUploading={isUploading}
              onReset={handleReset}
            />
          ) : (
            <StepUpload
              showCompanySelect={showCompanySelect}
              selectedCompanyId={selectedCompanyId}
              setSelectedCompanyId={setSelectedCompanyId}
              loadingCompanies={loadingCompanies}
              isProcessing={isProcessing}
              companies={companies}
              isDragging={isDragging}
              setIsDragging={setIsDragging}
              fileInputRef={fileInputRef}
              onFileSelect={processFile}
              onDownloadTemplate={onDownloadTemplate}
            />
          )}
        </div>

        <DialogFooter className="p-6 bg-muted/30 border-t flex-row gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-11 rounded-xl font-bold shadow-sm"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          {preValidation && (
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={
                preValidation.validRows.length === 0 ||
                !!preValidation.layoutError ||
                isUploading ||
                isProcessing
              }
              className="flex-1 h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold transition-all shadow-md"
            >
              {isUploading ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Upload className="size-4 mr-2" />
              )}
              {isUploading ? 'Importando...' : 'Confirmar Importação'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
