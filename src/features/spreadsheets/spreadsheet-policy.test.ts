import { describe, expect, it } from 'vitest'

import { identifySpreadsheetFile, SPREADSHEET_LIMITS } from './spreadsheet-policy'

const zipLocalFile = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
const zipEmptyArchive = new Uint8Array([0x50, 0x4b, 0x05, 0x06])
const zipEndOfCentralDirectory = new Uint8Array([0x50, 0x4b, 0x06, 0x06])
const compoundFile = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])
const utf8Csv = new TextEncoder().encode('Tarih,Tutar\n2026-08-26,120')

type IdentityCase = {
  name: string
  mimeType: string
  size: number
  prefix: Uint8Array
  expected:
    { kind: 'xlsx' | 'csv' } | { code: 'UNSUPPORTED_TYPE' | 'LIMIT_EXCEEDED' | 'INVALID_WORKBOOK' | 'UNSAFE_CONTENT' }
}

const identityCases: readonly IdentityCase[] = [
  {
    name: 'rapor.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 128,
    prefix: zipLocalFile,
    expected: { kind: 'xlsx' },
  },
  {
    name: 'bos.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 22,
    prefix: zipEmptyArchive,
    expected: { kind: 'xlsx' },
  },
  {
    name: 'zip64.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 56,
    prefix: zipEndOfCentralDirectory,
    expected: { kind: 'xlsx' },
  },
  { name: 'rapor.csv', mimeType: 'text/csv', size: utf8Csv.byteLength, prefix: utf8Csv, expected: { kind: 'csv' } },
  { name: 'RAPOR.XLSX', mimeType: '', size: 128, prefix: zipLocalFile, expected: { kind: 'xlsx' } },
  { name: 'RAPOR.CSV', mimeType: '', size: utf8Csv.byteLength, prefix: utf8Csv, expected: { kind: 'csv' } },
  {
    name: 'eski.xls',
    mimeType: 'application/vnd.ms-excel',
    size: 512,
    prefix: compoundFile,
    expected: { code: 'UNSUPPORTED_TYPE' },
  },
  {
    name: 'makrolu.xlsm',
    mimeType: 'application/vnd.ms-excel.sheet.macroenabled.12',
    size: 512,
    prefix: zipLocalFile,
    expected: { code: 'UNSUPPORTED_TYPE' },
  },
  {
    name: 'zararli.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 512,
    prefix: new Uint8Array([0x4d, 0x5a, 0x90, 0x00]),
    expected: { code: 'INVALID_WORKBOOK' },
  },
  {
    name: 'nul.csv',
    mimeType: 'text/csv',
    size: 5,
    prefix: new Uint8Array([0x61, 0x00, 0x62]),
    expected: { code: 'UNSAFE_CONTENT' },
  },
  {
    name: 'bozuk.csv',
    mimeType: 'text/csv',
    size: 3,
    prefix: new Uint8Array([0xc3, 0x28]),
    expected: { code: 'INVALID_WORKBOOK' },
  },
  {
    name: 'rapor.csv',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: utf8Csv.byteLength,
    prefix: utf8Csv,
    expected: { code: 'UNSUPPORTED_TYPE' },
  },
  {
    name: 'buyuk.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 3 * 1024 * 1024 + 1,
    prefix: zipLocalFile,
    expected: { code: 'LIMIT_EXCEEDED' },
  },
  {
    name: 'buyuk.csv',
    mimeType: 'text/csv',
    size: 1 * 1024 * 1024 + 1,
    prefix: utf8Csv,
    expected: { code: 'LIMIT_EXCEEDED' },
  },
]

describe('spreadsheet file identity policy', () => {
  it.each(identityCases)(
    'classifies $name without trusting only the extension',
    ({ name, mimeType, size, prefix, expected }) => {
      const result = identifySpreadsheetFile({ name, mimeType, size, prefix })

      if ('kind' in expected) {
        expect(result).toEqual({ ok: true, kind: expected.kind })
        return
      }

      expect(result).toMatchObject({ ok: false, result: { ok: false, code: expected.code } })
      if (!result.ok && !result.result.ok) {
        expect(result.result.message).not.toContain(name)
      }
    },
  )

  it('exports the frozen byte, resource, and time limits used by later parsing stages', () => {
    expect(SPREADSHEET_LIMITS).toEqual({
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
    expect(Object.isFrozen(SPREADSHEET_LIMITS)).toBe(true)
  })
})
