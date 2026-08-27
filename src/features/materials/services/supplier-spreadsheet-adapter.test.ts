import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { toSupplierReceiptAnalysisInput } from './supplier-spreadsheet-adapter'

describe('toSupplierReceiptAnalysisInput', () => {
  it('serializes neutral rows deterministically for the current receipt-analysis fileText contract', () => {
    expect(
      toSupplierReceiptAnalysisInput({
        kind: 'xlsx',
        sheetName: 'Fatura',
        rows: [
          ['Ürün', 'Miktar', 'Birim Fiyat'],
          ['Çay', 2, 45.5],
        ],
      }),
    ).toEqual({
      ok: true,
      content: '[["Ürün","Miktar","Birim Fiyat"],["Çay",2,45.5]]',
    })
  })

  it('rejects a table with no rows before analysis', () => {
    expect(toSupplierReceiptAnalysisInput({ kind: 'csv', sheetName: 'Sheet1', rows: [] })).toEqual({
      ok: false,
      message: 'Tabloda analiz edilecek satır bulunamadı.',
    })
  })

  it('keeps prototype-like cell values in rows instead of constructing keyed objects', () => {
    const result = toSupplierReceiptAnalysisInput({
      kind: 'csv',
      sheetName: 'Sheet1',
      rows: [
        ['__proto__', 'constructor'],
        ['Çay', 'prototype'],
      ],
    })

    expect(result).toEqual({
      ok: true,
      content: '[["__proto__","constructor"],["Çay","prototype"]]',
    })
  })

  it('does not include organization data in the analysis content', () => {
    const organizationId = '11111111-1111-4111-8111-111111111111'
    const result = toSupplierReceiptAnalysisInput({
      kind: 'xlsx',
      sheetName: 'Fatura',
      rows: [['Ürün'], ['Çay']],
    })

    expect(result).toEqual({ ok: true, content: '[["Ürün"],["Çay"]]' })
    if (result.ok) {
      expect(result.content).not.toContain(organizationId)
    }
  })

  it('does not import Supabase at the analysis boundary', async () => {
    const source = await readFile(resolve('src/features/materials/services/supplier-spreadsheet-adapter.ts'), 'utf8')

    expect(source).not.toMatch(/from\s+['"][^'"]*supabase[^'"]*['"]/i)
  })
})
