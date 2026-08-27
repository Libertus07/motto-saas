import * as XLSX from 'xlsx'
import { describe, expect, it, vi } from 'vitest'

import { parseSpreadsheetBytes } from './spreadsheet-parser-core'

type FixtureCell = string | number | boolean | null
type FixtureRows = FixtureCell[][]

const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const ZIP_INTERNAL_ENTRY_LIMIT = 1_024
const ZIP_INTERNAL_SINGLE_ENTRY_BYTES = 8 * 1024 * 1024
const ZIP_INTERNAL_TOTAL_BYTES = 16 * 1024 * 1024

function xlsxBytes(rows: FixtureRows, sheetName = 'Veri'): Uint8Array {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName)

  return new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', compression: true, type: 'array' }))
}

function workbookBytes(workbook: XLSX.WorkBook): Uint8Array {
  return new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', compression: true, type: 'array' }))
}

function withArchiveEntry(bytes: Uint8Array, path: string, content = '<fixture/>'): Uint8Array {
  const archive = XLSX.CFB.read(Array.from(bytes), { type: 'array' })
  XLSX.CFB.utils.cfb_add(archive, path, new TextEncoder().encode(content))

  return new Uint8Array(XLSX.CFB.write(archive, { compression: true, fileType: 'zip', type: 'array' }))
}

function matrix(rowCount: number, columnCount: number): FixtureRows {
  return Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => 1))
}

function expectFailure(result: ReturnType<typeof parseSpreadsheetBytes>, code: string): void {
  expect(result).toMatchObject({ ok: false, code })
}

function readUInt16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUInt32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

function writeUInt16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >>> 8) & 0xff
}

function writeUInt32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >>> 8) & 0xff
  bytes[offset + 2] = (value >>> 16) & 0xff
  bytes[offset + 3] = (value >>> 24) & 0xff
}

function endOfCentralDirectoryOffset(bytes: Uint8Array): number {
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (readUInt32(bytes, offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset
    }
  }

  throw new Error('Test fixture must contain ZIP end of central directory record.')
}

function centralDirectoryEntryOffsets(bytes: Uint8Array): number[] {
  const endOffset = endOfCentralDirectoryOffset(bytes)
  const entryCount = readUInt16(bytes, endOffset + 10)
  let offset = readUInt32(bytes, endOffset + 16)
  const entries: number[] = []

  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt32(bytes, offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error('Test fixture must contain valid central directory entries.')
    }

    entries.push(offset)
    offset += 46 + readUInt16(bytes, offset + 28) + readUInt16(bytes, offset + 30) + readUInt16(bytes, offset + 32)
  }

  return entries
}

function mutateZip(bytes: Uint8Array, mutate: (copy: Uint8Array) => void): Uint8Array {
  const copy = bytes.slice()
  mutate(copy)
  return copy
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

  it('accepts a normal SheetJS-generated XLSX through ZIP preflight', () => {
    expect(parseSpreadsheetBytes({ bytes: xlsxBytes([['normal']]), kind: 'xlsx' })).toMatchObject({ ok: true })
  })

  it.each([
    ['truncated end record', (bytes: Uint8Array) => bytes.slice(0, bytes.length - 1), 'INVALID_WORKBOOK'],
    [
      'impossible central directory offset',
      (bytes: Uint8Array) =>
        mutateZip(bytes, (copy) => writeUInt32(copy, endOfCentralDirectoryOffset(copy) + 16, copy.length - 1)),
      'INVALID_WORKBOOK',
    ],
    [
      'multi-disk archive marker',
      (bytes: Uint8Array) => mutateZip(bytes, (copy) => writeUInt16(copy, endOfCentralDirectoryOffset(copy) + 4, 1)),
      'INVALID_WORKBOOK',
    ],
    [
      'encrypted central directory entry',
      (bytes: Uint8Array) =>
        mutateZip(bytes, (copy) => {
          const entryOffset = centralDirectoryEntryOffsets(copy)[0]
          writeUInt16(copy, entryOffset + 8, readUInt16(copy, entryOffset + 8) | 1)
        }),
      'UNSAFE_CONTENT',
    ],
    [
      'ZIP64 central directory sentinel',
      (bytes: Uint8Array) => {
        return mutateZip(bytes, (copy) => writeUInt32(copy, centralDirectoryEntryOffsets(copy)[0] + 24, 0xffffffff))
      },
      'UNSAFE_CONTENT',
    ],
    [
      'ZIP64 locator record',
      (bytes: Uint8Array) =>
        mutateZip(bytes, (copy) => writeUInt32(copy, endOfCentralDirectoryOffset(copy) - 20, 0x07064b50)),
      'UNSAFE_CONTENT',
    ],
    [
      'declared entry count above the internal cap',
      (bytes: Uint8Array) =>
        mutateZip(bytes, (copy) => {
          const endOffset = endOfCentralDirectoryOffset(copy)
          writeUInt16(copy, endOffset + 8, ZIP_INTERNAL_ENTRY_LIMIT + 1)
          writeUInt16(copy, endOffset + 10, ZIP_INTERNAL_ENTRY_LIMIT + 1)
        }),
      'LIMIT_EXCEEDED',
    ],
    [
      'single entry above the internal uncompressed cap',
      (bytes: Uint8Array) =>
        mutateZip(bytes, (copy) =>
          writeUInt32(copy, centralDirectoryEntryOffsets(copy)[0] + 24, ZIP_INTERNAL_SINGLE_ENTRY_BYTES + 1),
        ),
      'LIMIT_EXCEEDED',
    ],
    [
      'total entries above the internal uncompressed cap',
      (bytes: Uint8Array) =>
        mutateZip(bytes, (copy) => {
          const entryOffsets = centralDirectoryEntryOffsets(copy)
          const declaredSize = Math.floor(ZIP_INTERNAL_TOTAL_BYTES / entryOffsets.length) + 1
          for (const entryOffset of entryOffsets) {
            writeUInt32(copy, entryOffset + 24, declaredSize)
          }
        }),
      'LIMIT_EXCEEDED',
    ],
  ])('rejects XLSX ZIP preflight %s', (_label, transform, code) => {
    expectFailure(parseSpreadsheetBytes({ bytes: transform(xlsxBytes([['deger']])), kind: 'xlsx' }), code)
  })

  it('rejects XLSX ZIP path traversal before SheetJS reads entries', () => {
    expectFailure(
      parseSpreadsheetBytes({ bytes: withArchiveEntry(xlsxBytes([['deger']]), '../outside.xml'), kind: 'xlsx' }),
      'UNSAFE_CONTENT',
    )
  })

  it('rejects a compressed XLSX entry whose declared expansion exceeds the internal cap', () => {
    const bytes = withArchiveEntry(
      xlsxBytes([['deger']]),
      'xl/media/highly-compressible-fixture.txt',
      'x'.repeat(ZIP_INTERNAL_SINGLE_ENTRY_BYTES + 1),
    )

    expect(bytes.byteLength).toBeLessThan(3 * 1024 * 1024)
    expectFailure(parseSpreadsheetBytes({ bytes, kind: 'xlsx' }), 'LIMIT_EXCEEDED')
  })

  it('rejects more than five XLSX sheets before converting cells', () => {
    const workbook = XLSX.utils.book_new()
    for (let index = 0; index < 6; index += 1) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[index]]), `Sayfa ${index + 1}`)
    }

    expectFailure(parseSpreadsheetBytes({ bytes: workbookBytes(workbook), kind: 'xlsx' }), 'LIMIT_EXCEEDED')
  })

  it('selects a visible sheet after a veryHidden XLSX sheet', () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['cok gizli']]), 'Cok Gizli')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['gorunur']]), 'Gorunur')
    workbook.Workbook = { Sheets: [{ Hidden: 2 }, { Hidden: 0 }] }

    expect(parseSpreadsheetBytes({ bytes: workbookBytes(workbook), kind: 'xlsx' })).toEqual({
      ok: true,
      table: { kind: 'xlsx', sheetName: 'Gorunur', rows: [['gorunur']] },
    })
  })

  it('validates the declared XLSX range before converting a sheet', () => {
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([['deger']])
    sheet['!ref'] = 'A1:A5001'
    XLSX.utils.book_append_sheet(workbook, sheet, 'Veri')

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

  it('converts CSV cell-conversion exceptions into a typed failure', () => {
    const sheetToJson = vi.spyOn(XLSX.utils, 'sheet_to_json').mockImplementationOnce(() => {
      throw new Error('fixture conversion failure')
    })

    try {
      expectFailure(
        parseSpreadsheetBytes({ bytes: new TextEncoder().encode('Baslik\ndeger'), kind: 'csv' }),
        'INVALID_WORKBOOK',
      )
    } finally {
      sheetToJson.mockRestore()
    }
  })

  it.each(['=TOPLA(A1:A2)', '+1+1', '-1', '@SUM(A1:A2)', ' =TOPLA(A1:A2)', '\t@SUM(A1:A2)'])(
    'rejects the CSV formula-like prefix %s',
    (value) => {
      expectFailure(
        parseSpreadsheetBytes({ bytes: new TextEncoder().encode(`Baslik\n${value}`), kind: 'csv' }),
        'UNSAFE_CONTENT',
      )
    },
  )

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
