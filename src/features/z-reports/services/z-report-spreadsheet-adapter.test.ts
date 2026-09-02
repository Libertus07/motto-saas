import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { toZReportAnalysisInput } from './z-report-spreadsheet-adapter'

describe('toZReportAnalysisInput', () => {
  it('serializes neutral spreadsheet rows deterministically for Z-report analysis', () => {
    expect(
      toZReportAnalysisInput({
        kind: 'xlsx',
        sheetName: 'Z Raporu',
        rows: [
          ['Ürün', 'Adet', 'Toplam'],
          ['Çay', 2, 45.5],
        ],
      }),
    ).toEqual({
      ok: true,
      content: '[["Ürün","Adet","Toplam"],["Çay",2,45.5]]',
    })
  })

  it('rejects an empty report before it reaches analysis', () => {
    expect(toZReportAnalysisInput({ kind: 'csv', sheetName: 'Sheet1', rows: [] })).toEqual({
      ok: false,
      message: 'Tabloda analiz edilecek satır bulunamadı.',
    })
  })

  it('preserves Turkish text, numeric zero, and boolean cells', () => {
    expect(
      toZReportAnalysisInput({
        kind: 'csv',
        sheetName: 'Gün Sonu',
        rows: [
          ['İçecek', 0, false],
          ['Öğle Menüsü', 12, true],
        ],
      }),
    ).toEqual({
      ok: true,
      content: '[["İçecek",0,false],["Öğle Menüsü",12,true]]',
    })
  })

  it('keeps organization context and financial writes outside analysis content and the adapter boundary', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111'
    const result = toZReportAnalysisInput({
      kind: 'xlsx',
      sheetName: 'Z Raporu',
      rows: [['Ürün'], ['Çay']],
    })

    expect(result).toEqual({ ok: true, content: '[["Ürün"],["Çay"]]' })
    if (result.ok) {
      expect(result.content).not.toContain(organizationId)
    }

    const source = await readFile(resolve('src/features/z-reports/services/z-report-spreadsheet-adapter.ts'), 'utf8')
    expect(source).not.toMatch(/supabase|persistZReportWrite|processZReport/i)
  })
})
