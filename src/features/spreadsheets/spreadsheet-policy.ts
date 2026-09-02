import type { SpreadsheetErrorCode, SpreadsheetKind, SpreadsheetParseResult } from './spreadsheet-types'

export const SPREADSHEET_LIMITS = Object.freeze({
  xlsxBytes: 3 * 1024 * 1024,
  csvBytes: 1 * 1024 * 1024,
  workbookSheets: 5,
  rows: 5_000,
  columns: 100,
  cells: 100_000,
  cellCharacters: 10_000,
  xlsxTimeoutMs: 8_000,
  csvTimeoutMs: 5_000,
})

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const CSV_MIME_TYPE = 'text/csv'

const ERROR_MESSAGES: Readonly<Record<SpreadsheetErrorCode, string>> = {
  UNSUPPORTED_TYPE: 'Bu dosya türü desteklenmiyor. XLSX veya CSV seçin.',
  LIMIT_EXCEEDED: 'Dosya güvenli işlem sınırlarını aşıyor.',
  INVALID_WORKBOOK: 'Dosya okunamadı veya beklenen tablo yapısına sahip değil.',
  UNSAFE_CONTENT: 'Dosya desteklenmeyen veya güvenli olmayan içerik içeriyor.',
  ORGANIZATION_CHANGED: 'İşletme değiştiği için dosya işlemi iptal edildi.',
  TIMEOUT: 'Dosyanın işlenmesi güvenli süre sınırını aştı.',
}

type SpreadsheetFileIdentityInput = {
  name: string
  mimeType: string
  size: number
  prefix: Uint8Array
}

type SpreadsheetFileIdentity = { ok: true; kind: SpreadsheetKind } | { ok: false; result: SpreadsheetParseResult }

function failure(code: SpreadsheetErrorCode): SpreadsheetFileIdentity {
  return {
    ok: false,
    result: {
      ok: false,
      code,
      message: ERROR_MESSAGES[code],
    },
  }
}

function hasZipSignature(prefix: Uint8Array): boolean {
  if (prefix.length < 4 || prefix[0] !== 0x50 || prefix[1] !== 0x4b) {
    return false
  }

  return (
    (prefix[2] === 0x03 && prefix[3] === 0x04) ||
    (prefix[2] === 0x05 && prefix[3] === 0x06) ||
    (prefix[2] === 0x06 && prefix[3] === 0x06)
  )
}

function isValidUtf8Csv(prefix: Uint8Array): boolean {
  if (prefix.includes(0)) {
    return false
  }

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(prefix)
    return true
  } catch {
    return false
  }
}

function extensionKind(name: string): SpreadsheetKind | null {
  const normalizedName = name.toLowerCase()

  if (normalizedName.endsWith('.xlsx')) {
    return 'xlsx'
  }

  if (normalizedName.endsWith('.csv')) {
    return 'csv'
  }

  return null
}

function hasMatchingMimeType(kind: SpreadsheetKind, mimeType: string): boolean {
  if (mimeType === '') {
    return true
  }

  const normalizedMimeType = mimeType.toLowerCase()
  return (
    (kind === 'xlsx' && normalizedMimeType === XLSX_MIME_TYPE) ||
    (kind === 'csv' && normalizedMimeType === CSV_MIME_TYPE)
  )
}

export function identifySpreadsheetFile(input: SpreadsheetFileIdentityInput): SpreadsheetFileIdentity {
  const kind = extensionKind(input.name)
  if (!kind || !hasMatchingMimeType(kind, input.mimeType)) {
    return failure('UNSUPPORTED_TYPE')
  }

  if (input.size > SPREADSHEET_LIMITS[`${kind}Bytes`]) {
    return failure('LIMIT_EXCEEDED')
  }

  if (kind === 'xlsx') {
    return hasZipSignature(input.prefix) ? { ok: true, kind } : failure('INVALID_WORKBOOK')
  }

  return isValidUtf8Csv(input.prefix)
    ? { ok: true, kind }
    : failure(input.prefix.includes(0) ? 'UNSAFE_CONTENT' : 'INVALID_WORKBOOK')
}
