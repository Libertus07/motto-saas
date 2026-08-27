import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'

import { parseSpreadsheetBytes } from './spreadsheet-parser-core'

type FixtureCell = string | number | boolean | null
type FixtureRows = FixtureCell[][]

function xlsxBytes(rows: FixtureRows, sheetName = 'Veri'): Uint8Array {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName)

  return new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', compression: true, type: 'array' }))
}

function workbookBytes(workbook: XLSX.WorkBook): Uint8Array {
  return new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', compression: true, type: 'array' }))
}

function withArchiveEntry(bytes: Uint8Array, path: string): Uint8Array {
  const archive = XLSX.CFB.read(Array.from(bytes), { type: 'array' })
  XLSX.CFB.utils.cfb_add(archive, path, new TextEncoder().encode('<fixture/>'))

  return new Uint8Array(XLSX.CFB.write(archive, { fileType: 'zip', type: 'array' }))
}

function matrix(rowCount: number, columnCount: number): FixtureRows {
  return Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => 1))
}

function expectFailure(result: ReturnType<typeof parseSpreadsheetBytes>, code: string): void {
  expect(result).toMatchObject({ ok: false, code })
}

describe('parseSpreadsheetBytes', () => {
  it('normalizes valid XLSX values into a neutral two-dimensional table', () => {
    const result = parseSpreadsheetBytes({
      bytes: xlsxBytes([[true, 42, 'Merhaba', null]]),
      kind: 'xlsx',
    })

    expect(result).toEqual({
      ok: true,
      table: {
        kind: 'xlsx',
        sheetName: 'Veri',
        rows: [[true, 42, 'Merhaba', null]],
      },
    })
  })

  it('selects the first visible XLSX sheet when the first sheet is hidden', () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['gizli']]), 'Gizli')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['gorunur']]), 'Gorunur')
    workbook.Workbook = { Sheets: [{ Hidden: 1 }, { Hidden: 0 }] }

    expect(parseSpreadsheetBytes({ bytes: workbookBytes(workbook), kind: 'xlsx' })).toEqual({
      ok: true,
      table: { kind: 'xlsx', sheetName: 'Gorunur', rows: [['gorunur']] },
    })
  })

  it('rejects an XLSX workbook with no visible sheet', () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['gizli']]), 'Gizli')
    workbook.Workbook = { Sheets: [{ Hidden: 1 }] }

    expectFailure(parseSpreadsheetBytes({ bytes: workbookBytes(workbook), kind: 'xlsx' }), 'INVALID_WORKBOOK')
  })

  it('rejects an XLSX formula even when it has a cached value', () => {
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([[2]])
    sheet.A1 = { f: '1+1', t: 'n', v: 2 }
    XLSX.utils.book_append_sheet(workbook, sheet, 'Veri')

    expectFailure(parseSpreadsheetBytes({ bytes: workbookBytes(workbook), kind: 'xlsx' }), 'UNSAFE_CONTENT')
  })

  it.each([
    ['VBA project', 'xl/vbaProject.bin'],
    ['external workbook link', 'xl/externalLinks/externalLink1.xml'],
    ['encryption metadata', 'EncryptionInfo'],
  ])('rejects XLSX archive metadata for %s', (_label, archivePath) => {
    expectFailure(
      parseSpreadsheetBytes({ bytes: withArchiveEntry(xlsxBytes([['deger']]), archivePath), kind: 'xlsx' }),
      'UNSAFE_CONTENT',
    )
  })

  it('rejects an invalid XLSX archive', () => {
    expectFailure(
      parseSpreadsheetBytes({ bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]), kind: 'xlsx' }),
      'INVALID_WORKBOOK',
    )
  })

  it('rejects more than five XLSX sheets before converting cells', () => {
    const workbook = XLSX.utils.book_new()
    for (let index = 0; index < 6; index += 1) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[index]]), `Sayfa ${index + 1}`)
    }

    expectFailure(parseSpreadsheetBytes({ bytes: workbookBytes(workbook), kind: 'xlsx' }), 'LIMIT_EXCEEDED')
  })

  it.each(['__proto__', 'prototype', 'constructor'])('rejects the XLSX prototype-control value %s', (value) => {
    expectFailure(parseSpreadsheetBytes({ bytes: xlsxBytes([[value]]), kind: 'xlsx' }), 'UNSAFE_CONTENT')
  })

  it.each([
    ['XLSX byte size', () => new Uint8Array(3 * 1024 * 1024 + 1)],
    ['XLSX rows', () => xlsxBytes(matrix(5_001, 1))],
    ['XLSX columns', () => xlsxBytes(matrix(1, 101))],
    ['XLSX cells', () => xlsxBytes(matrix(1_001, 100))],
    ['XLSX cell characters', () => xlsxBytes([['x'.repeat(10_001)]])],
  ])('rejects %s beyond the resource boundary', (_label, buildBytes) => {
    expectFailure(parseSpreadsheetBytes({ bytes: buildBytes(), kind: 'xlsx' }), 'LIMIT_EXCEEDED')
  })

  it('preserves strict CSV text without inferring dates or numbers', () => {
    const bytes = new TextEncoder().encode('Tarih,Tutar,Aciklama,Adet\r\n2026-08-26,"1,25",İçecek,120')

    expect(parseSpreadsheetBytes({ bytes, kind: 'csv' })).toEqual({
      ok: true,
      table: {
        kind: 'csv',
        sheetName: 'Sheet1',
        rows: [
          ['Tarih', 'Tutar', 'Aciklama', 'Adet'],
          ['2026-08-26', '1,25', 'İçecek', '120'],
        ],
      },
    })
  })

  it.each(['=TOPLA(A1:A2)', '+1+1', '-1', '@SUM(A1:A2)'])('rejects the CSV formula-like prefix %s', (value) => {
    expectFailure(
      parseSpreadsheetBytes({ bytes: new TextEncoder().encode(`Baslik\n${value}`), kind: 'csv' }),
      'UNSAFE_CONTENT',
    )
  })

  it.each(['__proto__', 'prototype', 'constructor'])('rejects the CSV prototype-control value %s', (value) => {
    expectFailure(
      parseSpreadsheetBytes({ bytes: new TextEncoder().encode(`Baslik\n${value}`), kind: 'csv' }),
      'UNSAFE_CONTENT',
    )
  })

  it.each([
    ['invalid UTF-8', new Uint8Array([0xc3, 0x28]), 'INVALID_WORKBOOK'],
    ['NUL content', new Uint8Array([0x61, 0x00, 0x62]), 'UNSAFE_CONTENT'],
  ])('rejects CSV with %s', (_label, bytes, code) => {
    expectFailure(parseSpreadsheetBytes({ bytes, kind: 'csv' }), code)
  })

  it.each([
    ['CSV byte size', () => new Uint8Array(1 * 1024 * 1024 + 1)],
    ['CSV rows', () => new TextEncoder().encode(`${'deger\n'.repeat(5_001)}`)],
    ['CSV columns', () => new TextEncoder().encode(Array.from({ length: 101 }, () => 'deger').join(','))],
    [
      'CSV cells',
      () => new TextEncoder().encode(`${`${Array.from({ length: 100 }, () => '1').join(',')}\n`.repeat(1_001)}`),
    ],
    ['CSV cell characters', () => new TextEncoder().encode('x'.repeat(10_001))],
  ])('rejects %s beyond the resource boundary', (_label, buildBytes) => {
    expectFailure(parseSpreadsheetBytes({ bytes: buildBytes(), kind: 'csv' }), 'LIMIT_EXCEEDED')
  })
})
