import * as XLSX from 'xlsx'

import { SPREADSHEET_LIMITS } from './spreadsheet-policy'
import type {
  SpreadsheetCell,
  SpreadsheetErrorCode,
  SpreadsheetKind,
  SpreadsheetParseResult,
} from './spreadsheet-types'

type ParseInput = {
  bytes: Uint8Array
  kind: SpreadsheetKind
}

type ParsedWorkbook = XLSX.WorkBook & {
  Encryption?: unknown
  files?: Readonly<Record<string, unknown>>
  keys?: readonly string[]
}

const ERROR_MESSAGES: Readonly<Record<SpreadsheetErrorCode, string>> = {
  UNSUPPORTED_TYPE: 'Bu dosya türü desteklenmiyor. XLSX veya CSV seçin.',
  LIMIT_EXCEEDED: 'Dosya güvenli işlem sınırlarını aşıyor.',
  INVALID_WORKBOOK: 'Dosya okunamadı veya beklenen tablo yapısına sahip değil.',
  UNSAFE_CONTENT: 'Dosya desteklenmeyen veya güvenli olmayan içerik içeriyor.',
  ORGANIZATION_CHANGED: 'İşletme değiştiği için dosya işlemi iptal edildi.',
  TIMEOUT: 'Dosyanın işlenmesi güvenli süre sınırını aştı.',
}

function failure(code: SpreadsheetErrorCode): SpreadsheetParseResult {
  return { ok: false, code, message: ERROR_MESSAGES[code] }
}

function hasUnsafeArchiveEntry(workbook: ParsedWorkbook): boolean {
  if (workbook.vbaraw !== undefined || workbook.Encryption !== undefined) {
    return true
  }

  return (workbook.keys ?? []).some((key) => {
    const normalizedKey = key.toLowerCase().replace(/^\/+/, '')
    return (
      normalizedKey === 'xl/vbaproject.bin' ||
      normalizedKey.startsWith('xl/externallinks/') ||
      normalizedKey === 'encryptioninfo' ||
      normalizedKey === 'encryptedpackage'
    )
  })
}

function selectFirstVisibleSheet(workbook: ParsedWorkbook): { name: string; sheet: XLSX.WorkSheet } | null {
  for (const [index, name] of workbook.SheetNames.entries()) {
    const visibility = workbook.Workbook?.Sheets?.[index]?.Hidden ?? 0
    const sheet = workbook.Sheets[name]
    if (visibility === 0 && sheet) {
      return { name, sheet }
    }
  }

  return null
}

function cellHasFormula(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'f' in value && typeof value.f === 'string'
}

function valueHasFormula(value: unknown): boolean {
  if (cellHasFormula(value)) {
    return true
  }

  return Array.isArray(value) && value.some(valueHasFormula)
}

function sheetHasFormula(sheet: XLSX.WorkSheet): boolean {
  for (const value of Object.values(sheet)) {
    if (valueHasFormula(value)) {
      return true
    }
  }

  return false
}

function isPrototypeControlValue(value: string): boolean {
  return value === '__proto__' || value === 'prototype' || value === 'constructor'
}

function normalizeCell(value: unknown): SpreadsheetCell | null {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  return null
}

function normalizeRows(input: { kind: SpreadsheetKind; rawRows: unknown; sheetName: string }): SpreadsheetParseResult {
  if (!Array.isArray(input.rawRows)) {
    return failure('INVALID_WORKBOOK')
  }

  if (input.rawRows.length > SPREADSHEET_LIMITS.rows) {
    return failure('LIMIT_EXCEEDED')
  }

  let cellCount = 0
  const rows: SpreadsheetCell[][] = []

  for (const rawRow of input.rawRows) {
    if (!Array.isArray(rawRow)) {
      return failure('INVALID_WORKBOOK')
    }

    if (rawRow.length > SPREADSHEET_LIMITS.columns) {
      return failure('LIMIT_EXCEEDED')
    }

    const row: SpreadsheetCell[] = []
    for (const rawCell of rawRow) {
      cellCount += 1
      if (cellCount > SPREADSHEET_LIMITS.cells) {
        return failure('LIMIT_EXCEEDED')
      }

      const cell = normalizeCell(rawCell)
      if (cell === null && rawCell !== null) {
        return failure('INVALID_WORKBOOK')
      }

      if (typeof cell === 'string') {
        if (cell.length > SPREADSHEET_LIMITS.cellCharacters) {
          return failure('LIMIT_EXCEEDED')
        }

        if (isPrototypeControlValue(cell)) {
          return failure('UNSAFE_CONTENT')
        }

        if (input.kind === 'csv' && /^[=+\-@]/.test(cell)) {
          return failure('UNSAFE_CONTENT')
        }
      }

      row.push(cell)
    }

    rows.push(row)
  }

  return { ok: true, table: { kind: input.kind, sheetName: input.sheetName, rows } }
}

function parseXlsx(bytes: Uint8Array): SpreadsheetParseResult {
  let workbook: ParsedWorkbook

  try {
    workbook = XLSX.read(bytes, {
      type: 'array',
      dense: true,
      raw: true,
      bookFiles: true,
      bookVBA: true,
      sheetRows: SPREADSHEET_LIMITS.rows + 1,
    })
  } catch {
    return failure('INVALID_WORKBOOK')
  }

  if (workbook.SheetNames.length > SPREADSHEET_LIMITS.workbookSheets) {
    return failure('LIMIT_EXCEEDED')
  }

  if (hasUnsafeArchiveEntry(workbook)) {
    return failure('UNSAFE_CONTENT')
  }

  const selectedSheet = selectFirstVisibleSheet(workbook)
  if (!selectedSheet) {
    return failure('INVALID_WORKBOOK')
  }

  if (sheetHasFormula(selectedSheet.sheet)) {
    return failure('UNSAFE_CONTENT')
  }

  const rawRows: unknown = XLSX.utils.sheet_to_json(selectedSheet.sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  })

  return normalizeRows({ kind: 'xlsx', rawRows, sheetName: selectedSheet.name })
}

function parseCsv(bytes: Uint8Array): SpreadsheetParseResult {
  if (bytes.includes(0)) {
    return failure('UNSAFE_CONTENT')
  }

  let csv: string
  try {
    csv = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return failure('INVALID_WORKBOOK')
  }

  let workbook: ParsedWorkbook
  try {
    workbook = XLSX.read(csv, {
      type: 'string',
      dense: true,
      raw: true,
      FS: ',',
      sheetRows: SPREADSHEET_LIMITS.rows + 1,
    })
  } catch {
    return failure('INVALID_WORKBOOK')
  }

  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheetName || !sheet) {
    return failure('INVALID_WORKBOOK')
  }

  const rawRows: unknown = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  })

  return normalizeRows({ kind: 'csv', rawRows, sheetName })
}

export function parseSpreadsheetBytes(input: ParseInput): SpreadsheetParseResult {
  const byteLimit = input.kind === 'xlsx' ? SPREADSHEET_LIMITS.xlsxBytes : SPREADSHEET_LIMITS.csvBytes
  if (input.bytes.byteLength > byteLimit) {
    return failure('LIMIT_EXCEEDED')
  }

  return input.kind === 'xlsx' ? parseXlsx(input.bytes) : parseCsv(input.bytes)
}
