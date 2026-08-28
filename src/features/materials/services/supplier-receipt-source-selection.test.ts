import { describe, expect, it, vi } from 'vitest'

import { createSupplierReceiptSourceSelection } from './supplier-receipt-source-selection'

function createSelection() {
  const clear = vi.fn()
  const cancelSpreadsheetParsing = vi.fn()
  const selection = createSupplierReceiptSourceSelection({ clear, cancelSpreadsheetParsing })

  return { selection, clear, cancelSpreadsheetParsing }
}

describe('supplier receipt source selection', () => {
  it('clears the current receipt and cancels spreadsheet work before a new source is validated', () => {
    const events: string[] = []
    const selection = createSupplierReceiptSourceSelection({
      clear: () => events.push('clear'),
      cancelSpreadsheetParsing: () => events.push('cancel'),
    })

    selection.begin()

    expect(events).toEqual(['clear', 'cancel'])
  })

  it('suppresses a late spreadsheet result after a newer PDF source begins', () => {
    const { selection } = createSelection()
    const spreadsheetGeneration = selection.begin()
    const pdfGeneration = selection.begin()
    const spreadsheet = new File(['xlsx'], 'receipt.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    expect(selection.stage(spreadsheetGeneration, spreadsheet)).toBe(false)
    expect(selection.stage(pdfGeneration, null)).toBe(true)
    expect(selection.isCurrent(spreadsheetGeneration)).toBe(false)
  })

  it('does not make parsed content persistence-ready until the user reaches review', () => {
    const { selection } = createSelection()
    const generation = selection.begin()
    const receipt = new File(['xlsx'], 'receipt.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const persist = vi.fn()

    expect(selection.stage(generation, receipt)).toBe(true)
    expect(selection.persistReviewed(generation, persist)).toBeUndefined()
    expect(persist).not.toHaveBeenCalled()
  })

  it('keeps the existing save path as the only persistence owner after review', () => {
    const { selection } = createSelection()
    const xlsxGeneration = selection.begin()
    const xlsx = new File(['xlsx'], 'receipt.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const persist = vi.fn((persistenceFile: File | null) => persistenceFile)

    selection.stage(xlsxGeneration, xlsx)
    expect(selection.markReviewed(xlsxGeneration)).toBe(true)
    expect(selection.persistReviewed(xlsxGeneration, persist)).toBe(xlsx)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('propagates an XLSX file but a null CSV file to the reviewed save path', () => {
    const { selection } = createSelection()
    const persist = vi.fn((persistenceFile: File | null) => persistenceFile)
    const xlsxGeneration = selection.begin()
    const xlsx = new File(['xlsx'], 'receipt.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    selection.stage(xlsxGeneration, xlsx)
    selection.markReviewed(xlsxGeneration)
    expect(selection.persistReviewed(xlsxGeneration, persist)).toBe(xlsx)

    const csvGeneration = selection.begin()
    selection.stage(csvGeneration, null)
    expect(selection.markReviewed(csvGeneration)).toBe(true)
    expect(selection.persistReviewed(csvGeneration, persist)).toBeNull()
    expect(persist).toHaveBeenNthCalledWith(1, xlsx)
    expect(persist).toHaveBeenNthCalledWith(2, null)
  })

  it('cancels without clearing React state and invalidates an in-flight source when the page unmounts', () => {
    const { selection, clear, cancelSpreadsheetParsing } = createSelection()
    const generation = selection.begin()

    selection.dispose()

    expect(cancelSpreadsheetParsing).toHaveBeenCalledTimes(2)
    expect(clear).toHaveBeenCalledTimes(1)
    expect(selection.isCurrent(generation)).toBe(false)
    expect(selection.stage(generation, null)).toBe(false)
  })
})
