import type { SpreadsheetTable } from '@/features/spreadsheets/spreadsheet-types'

type SupplierReceiptAnalysisInput = { ok: true; content: string } | { ok: false; message: string }

export function toSupplierReceiptAnalysisInput(table: SpreadsheetTable): SupplierReceiptAnalysisInput {
  if (table.rows.length === 0) {
    return { ok: false, message: 'Tabloda analiz edilecek satır bulunamadı.' }
  }

  return { ok: true, content: JSON.stringify(table.rows) }
}
