import type { SpreadsheetTable } from '@/features/spreadsheets/spreadsheet-types'

type ZReportAnalysisInput = { ok: true; content: string } | { ok: false; message: string }

export function toZReportAnalysisInput(table: SpreadsheetTable): ZReportAnalysisInput {
  if (table.rows.length === 0) {
    return { ok: false, message: 'Tabloda analiz edilecek satır bulunamadı.' }
  }

  return { ok: true, content: JSON.stringify(table.rows) }
}
