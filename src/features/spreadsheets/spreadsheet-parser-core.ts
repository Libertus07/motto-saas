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

const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50
const ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE = 0x07064b50

// These bounds prevent a small accepted XLSX archive from expanding unboundedly before SheetJS reads it.
const ZIP_PRE_FLIGHT_LIMITS = Object.freeze({
  entries: 1_024,
  singleEntryBytes: 8 * 1024 * 1024,
  totalUncompressedBytes: 16 * 1024 * 1024,
})

function failure(code: SpreadsheetErrorCode): SpreadsheetParseResult {
  return { ok: false, code, message: ERROR_MESSAGES[code] }
}

function readUInt16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUInt32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

function hasByteRange(bytes: Uint8Array, offset: number, length: number): boolean {
  return (
    Number.isSafeInteger(offset) &&
    Number.isSafeInteger(length) &&
    offset >= 0 &&
    length >= 0 &&
    length <= bytes.length - offset
  )
}

function hasMatchingByteRange(bytes: Uint8Array, leftOffset: number, rightOffset: number, length: number): boolean {
  if (!hasByteRange(bytes, leftOffset, length) || !hasByteRange(bytes, rightOffset, length)) {
    return false
  }

  for (let index = 0; index < length; index += 1) {
    if (bytes[leftOffset + index] !== bytes[rightOffset + index]) {
      return false
    }
  }

  return true
}

function findEndOfCentralDirectory(bytes: Uint8Array): number | null {
  const minimumOffset = Math.max(0, bytes.length - 65_557)
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (readUInt32(bytes, offset) !== ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE || !hasByteRange(bytes, offset, 22)) {
      continue
    }

    const commentLength = readUInt16(bytes, offset + 20)
    if (offset + 22 + commentLength === bytes.length) {
      return offset
    }
  }

  return null
}

function decodeZipEntryName(bytes: Uint8Array, offset: number, length: number): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(offset, offset + length))
  } catch {
    return null
  }
}

function isUnsafeZipEntryName(name: string): boolean {
  if (name.length === 0 || name.startsWith('/') || name.includes('\\') || name.includes('\0')) {
    return true
  }

  const segments = name.split('/')
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return true
  }

  const normalizedName = name.toLowerCase()
  return (
    normalizedName === 'xl/vbaproject.bin' ||
    normalizedName.startsWith('xl/externallinks/') ||
    normalizedName === 'encryptioninfo' ||
    normalizedName === 'encryptedpackage'
  )
}

function hasZip64ExtraField(bytes: Uint8Array, offset: number, length: number): boolean | null {
  const endOffset = offset + length
  for (let cursor = offset; cursor < endOffset;) {
    if (!hasByteRange(bytes, cursor, 4) || cursor + 4 > endOffset) {
      return null
    }

    const identifier = readUInt16(bytes, cursor)
    const fieldLength = readUInt16(bytes, cursor + 2)
    cursor += 4
    if (fieldLength > endOffset - cursor) {
      return null
    }

    if (identifier === 0x0001) {
      return true
    }

    cursor += fieldLength
  }

  return false
}

function preflightXlsxZip(bytes: Uint8Array): SpreadsheetErrorCode | null {
  const endOffset = findEndOfCentralDirectory(bytes)
  if (endOffset === null) {
    return 'INVALID_WORKBOOK'
  }

  if (endOffset >= 20 && readUInt32(bytes, endOffset - 20) === ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE) {
    return 'UNSAFE_CONTENT'
  }

  const diskNumber = readUInt16(bytes, endOffset + 4)
  const centralDirectoryDisk = readUInt16(bytes, endOffset + 6)
  const entriesOnDisk = readUInt16(bytes, endOffset + 8)
  const entryCount = readUInt16(bytes, endOffset + 10)
  const centralDirectorySize = readUInt32(bytes, endOffset + 12)
  const centralDirectoryOffset = readUInt32(bytes, endOffset + 16)

  if (
    entriesOnDisk === 0xffff ||
    entryCount === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    return 'UNSAFE_CONTENT'
  }

  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== entryCount) {
    return 'INVALID_WORKBOOK'
  }

  if (entryCount > ZIP_PRE_FLIGHT_LIMITS.entries) {
    return 'LIMIT_EXCEEDED'
  }

  if (
    !hasByteRange(bytes, centralDirectoryOffset, centralDirectorySize) ||
    centralDirectoryOffset + centralDirectorySize !== endOffset
  ) {
    return 'INVALID_WORKBOOK'
  }

  let centralDirectoryCursor = centralDirectoryOffset
  let totalUncompressedBytes = 0
  for (let index = 0; index < entryCount; index += 1) {
    if (
      !hasByteRange(bytes, centralDirectoryCursor, 46) ||
      readUInt32(bytes, centralDirectoryCursor) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      return 'INVALID_WORKBOOK'
    }

    const flags = readUInt16(bytes, centralDirectoryCursor + 8)
    const compressionMethod = readUInt16(bytes, centralDirectoryCursor + 10)
    const compressedSize = readUInt32(bytes, centralDirectoryCursor + 20)
    const uncompressedSize = readUInt32(bytes, centralDirectoryCursor + 24)
    const nameLength = readUInt16(bytes, centralDirectoryCursor + 28)
    const extraLength = readUInt16(bytes, centralDirectoryCursor + 30)
    const commentLength = readUInt16(bytes, centralDirectoryCursor + 32)
    const diskStart = readUInt16(bytes, centralDirectoryCursor + 34)
    const localHeaderOffset = readUInt32(bytes, centralDirectoryCursor + 42)
    const recordLength = 46 + nameLength + extraLength + commentLength

    if (
      !hasByteRange(bytes, centralDirectoryCursor, recordLength) ||
      centralDirectoryCursor + recordLength > endOffset
    ) {
      return 'INVALID_WORKBOOK'
    }

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff ||
      diskStart === 0xffff
    ) {
      return 'UNSAFE_CONTENT'
    }

    if ((flags & 0x41) !== 0) {
      return 'UNSAFE_CONTENT'
    }

    // Data-descriptor archives defer local size fields, so reject them rather than accepting ambiguous local metadata.
    if ((flags & 0x08) !== 0) {
      return 'UNSAFE_CONTENT'
    }

    const zip64Extra = hasZip64ExtraField(bytes, centralDirectoryCursor + 46 + nameLength, extraLength)
    if (zip64Extra === null) {
      return 'INVALID_WORKBOOK'
    }

    if (zip64Extra) {
      return 'UNSAFE_CONTENT'
    }

    const entryName = decodeZipEntryName(bytes, centralDirectoryCursor + 46, nameLength)
    if (entryName === null) {
      return 'INVALID_WORKBOOK'
    }

    if (isUnsafeZipEntryName(entryName)) {
      return 'UNSAFE_CONTENT'
    }

    if (uncompressedSize > ZIP_PRE_FLIGHT_LIMITS.singleEntryBytes) {
      return 'LIMIT_EXCEEDED'
    }

    totalUncompressedBytes += uncompressedSize
    if (totalUncompressedBytes > ZIP_PRE_FLIGHT_LIMITS.totalUncompressedBytes) {
      return 'LIMIT_EXCEEDED'
    }

    if (
      !hasByteRange(bytes, localHeaderOffset, 30) ||
      readUInt32(bytes, localHeaderOffset) !== ZIP_LOCAL_FILE_SIGNATURE
    ) {
      return 'INVALID_WORKBOOK'
    }

    const localFlags = readUInt16(bytes, localHeaderOffset + 6)
    const localCompressionMethod = readUInt16(bytes, localHeaderOffset + 8)
    const localCompressedSize = readUInt32(bytes, localHeaderOffset + 18)
    const localUncompressedSize = readUInt32(bytes, localHeaderOffset + 22)
    const localNameLength = readUInt16(bytes, localHeaderOffset + 26)
    const localExtraLength = readUInt16(bytes, localHeaderOffset + 28)
    const localDataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength
    if (
      !hasByteRange(bytes, localHeaderOffset, 30 + localNameLength + localExtraLength) ||
      !hasByteRange(bytes, localDataOffset, localCompressedSize) ||
      localDataOffset + localCompressedSize > centralDirectoryOffset
    ) {
      return 'INVALID_WORKBOOK'
    }

    if (localUncompressedSize > ZIP_PRE_FLIGHT_LIMITS.singleEntryBytes) {
      return 'LIMIT_EXCEEDED'
    }

    if (
      localFlags !== flags ||
      localCompressionMethod !== compressionMethod ||
      localCompressedSize !== compressedSize ||
      localUncompressedSize !== uncompressedSize ||
      localNameLength !== nameLength ||
      !hasMatchingByteRange(bytes, localHeaderOffset + 30, centralDirectoryCursor + 46, nameLength)
    ) {
      return 'INVALID_WORKBOOK'
    }

    const localZip64Extra = hasZip64ExtraField(bytes, localHeaderOffset + 30 + localNameLength, localExtraLength)
    if (localZip64Extra === null) {
      return 'INVALID_WORKBOOK'
    }

    if (localZip64Extra) {
      return 'UNSAFE_CONTENT'
    }

    const localEntryName = decodeZipEntryName(bytes, localHeaderOffset + 30, localNameLength)
    if (localEntryName === null || localEntryName !== entryName) {
      return 'INVALID_WORKBOOK'
    }

    centralDirectoryCursor += recordLength
  }

  return centralDirectoryCursor === endOffset ? null : 'INVALID_WORKBOOK'
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

        if (input.kind === 'csv' && /^[=+\-@]/.test(cell.trimStart())) {
          return failure('UNSAFE_CONTENT')
        }
      }

      row.push(cell)
    }

    rows.push(row)
  }

  return { ok: true, table: { kind: input.kind, sheetName: input.sheetName, rows } }
}

function validateSheetRange(sheet: XLSX.WorkSheet): SpreadsheetErrorCode | null {
  const reference: unknown = sheet['!ref']
  if (reference === undefined) {
    return 'INVALID_WORKBOOK'
  }

  if (typeof reference !== 'string') {
    return 'INVALID_WORKBOOK'
  }

  try {
    const range = XLSX.utils.decode_range(reference)
    const rowCount = range.e.r - range.s.r + 1
    const columnCount = range.e.c - range.s.c + 1
    if (rowCount > SPREADSHEET_LIMITS.rows || columnCount > SPREADSHEET_LIMITS.columns) {
      return 'LIMIT_EXCEEDED'
    }

    return rowCount * columnCount > SPREADSHEET_LIMITS.cells ? 'LIMIT_EXCEEDED' : null
  } catch {
    return 'INVALID_WORKBOOK'
  }
}

function normalizeWorksheet(input: {
  kind: SpreadsheetKind
  sheet: XLSX.WorkSheet
  sheetName: string
}): SpreadsheetParseResult {
  const rangeFailure = validateSheetRange(input.sheet)
  if (rangeFailure) {
    return failure(rangeFailure)
  }

  try {
    const rawRows: unknown = XLSX.utils.sheet_to_json(input.sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    })

    return normalizeRows({ kind: input.kind, rawRows, sheetName: input.sheetName })
  } catch {
    return failure('INVALID_WORKBOOK')
  }
}

function parseXlsx(bytes: Uint8Array): SpreadsheetParseResult {
  const preflightFailure = preflightXlsxZip(bytes)
  if (preflightFailure) {
    return failure(preflightFailure)
  }

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

  return normalizeWorksheet({ kind: 'xlsx', sheet: selectedSheet.sheet, sheetName: selectedSheet.name })
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

  return normalizeWorksheet({ kind: 'csv', sheet, sheetName })
}

export function parseSpreadsheetBytes(input: ParseInput): SpreadsheetParseResult {
  const byteLimit = input.kind === 'xlsx' ? SPREADSHEET_LIMITS.xlsxBytes : SPREADSHEET_LIMITS.csvBytes
  if (input.bytes.byteLength > byteLimit) {
    return failure('LIMIT_EXCEEDED')
  }

  return input.kind === 'xlsx' ? parseXlsx(input.bytes) : parseCsv(input.bytes)
}
