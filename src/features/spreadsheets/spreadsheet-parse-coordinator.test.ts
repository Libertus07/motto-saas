import { describe, expect, it } from 'vitest'

import { parseSpreadsheet } from './parse-spreadsheet'
import { createSpreadsheetParseCoordinator } from './spreadsheet-parse-coordinator'
import type { SpreadsheetParseResult } from './spreadsheet-types'

type DeferredResult = {
  resolve: (result: SpreadsheetParseResult) => void
  reject: (error: Error) => void
  signal: AbortSignal | undefined
}

const successfulResult: SpreadsheetParseResult = {
  ok: true,
  table: { kind: 'csv', sheetName: 'CSV', rows: [['Ürün']] },
}

function spreadsheetFile(): File {
  return new File(['Ürün\nÇay'], 'stok.csv', { type: 'text/csv' })
}

function deferredParser(results: DeferredResult[]): typeof parseSpreadsheet {
  return (_file, options) =>
    new Promise<SpreadsheetParseResult>((resolve, reject) => {
      results.push({ resolve, reject, signal: options?.signal })
    })
}

describe('spreadsheet parse coordinator', () => {
  it('returns null for an older organization after a newer run starts', async () => {
    const pending: DeferredResult[] = []
    const coordinator = createSpreadsheetParseCoordinator({ parse: deferredParser(pending) })

    const first = coordinator.run(spreadsheetFile(), 'organization-a')
    const second = coordinator.run(spreadsheetFile(), 'organization-b')

    expect(pending[0].signal?.aborted).toBe(true)
    pending[1].resolve(successfulResult)
    await expect(second).resolves.toEqual({ organizationId: 'organization-b', result: successfulResult })

    pending[0].resolve(successfulResult)
    await expect(first).resolves.toBeNull()
  })

  it('aborts and invalidates the active generation when cancelled', async () => {
    const pending: DeferredResult[] = []
    const coordinator = createSpreadsheetParseCoordinator({ parse: deferredParser(pending) })
    const running = coordinator.run(spreadsheetFile(), 'organization-a')

    coordinator.cancel()

    expect(pending[0].signal?.aborted).toBe(true)
    pending[0].resolve(successfulResult)
    await expect(running).resolves.toBeNull()
  })

  it('returns null for a stale rejection and retains the newer controller until it is cancelled', async () => {
    const pending: DeferredResult[] = []
    const coordinator = createSpreadsheetParseCoordinator({ parse: deferredParser(pending) })
    const first = coordinator.run(spreadsheetFile(), 'organization-a')
    const second = coordinator.run(spreadsheetFile(), 'organization-b')

    pending[0].reject(new Error('older parse failed'))
    await expect(first).resolves.toBeNull()

    coordinator.cancel()
    expect(pending[1].signal?.aborted).toBe(true)
    pending[1].resolve(successfulResult)
    await expect(second).resolves.toBeNull()
  })

  it('propagates a rejection from the active generation', async () => {
    const pending: DeferredResult[] = []
    const coordinator = createSpreadsheetParseCoordinator({ parse: deferredParser(pending) })
    const running = coordinator.run(spreadsheetFile(), 'organization-a')

    pending[0].reject(new Error('current parse failed'))

    await expect(running).rejects.toThrow('current parse failed')
  })
})
