export type SpreadsheetKind = 'xlsx' | 'csv'

export type SpreadsheetErrorCode =
  'UNSUPPORTED_TYPE' | 'LIMIT_EXCEEDED' | 'INVALID_WORKBOOK' | 'UNSAFE_CONTENT' | 'ORGANIZATION_CHANGED' | 'TIMEOUT'

export type SpreadsheetCell = string | number | boolean | null

export type SpreadsheetTable = {
  kind: SpreadsheetKind
  sheetName: string
  rows: readonly (readonly SpreadsheetCell[])[]
}

export type SpreadsheetParseResult =
  { ok: true; table: SpreadsheetTable } | { ok: false; code: SpreadsheetErrorCode; message: string }
