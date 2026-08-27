import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseSpreadsheet } from './parse-spreadsheet'
import { SPREADSHEET_LIMITS } from './spreadsheet-policy'
import type { SpreadsheetParseResult } from './spreadsheet-types'

type WorkerRequest = {
  id: string
  kind: 'xlsx' | 'csv'
  bytes: ArrayBuffer
}

class FakeWorker {
  readonly messageListeners = new Set<(event: MessageEvent) => void>()
  readonly errorListeners = new Set<(event: ErrorEvent) => void>()
  readonly terminate = vi.fn()
  postedMessage: WorkerRequest | null = null
  transfer: Transferable[] = []

  postMessage(message: WorkerRequest, transfer: Transferable[] = []): void {
    this.postedMessage = message
    this.transfer = transfer
  }

  addEventListener(type: 'message' | 'error', listener: EventListener): void {
    if (type === 'message') {
      this.messageListeners.add(listener as (event: MessageEvent) => void)
      return
    }

    this.errorListeners.add(listener as (event: ErrorEvent) => void)
  }

  removeEventListener(type: 'message' | 'error', listener: EventListener): void {
    if (type === 'message') {
      this.messageListeners.delete(listener as (event: MessageEvent) => void)
      return
    }

    this.errorListeners.delete(listener as (event: ErrorEvent) => void)
  }

  emitResult(result: SpreadsheetParseResult): void {
    for (const listener of this.messageListeners) {
      listener({ data: { type: 'result', id: this.postedMessage?.id, result } } as MessageEvent)
    }
  }

  emitError(): void {
    for (const listener of this.errorListeners) {
      listener({} as ErrorEvent)
    }
  }

  listenerCount(): number {
    return this.messageListeners.size + this.errorListeners.size
  }
}

class TrackingAbortSignal {
  aborted = false
  private readonly listeners = new Set<() => void>()

  addEventListener(type: string, listener: () => void): void {
    if (type === 'abort') {
      this.listeners.add(listener)
    }
  }

  removeEventListener(type: string, listener: () => void): void {
    if (type === 'abort') {
      this.listeners.delete(listener)
    }
  }

  abort(): void {
    this.aborted = true
    for (const listener of this.listeners) {
      listener()
    }
  }

  listenerCount(): number {
    return this.listeners.size
  }
}

function spreadsheetFile(name: string, type: string, bytes: Uint8Array): File {
  return {
    name,
    type,
    size: bytes.byteLength,
    slice(start = 0, end = bytes.byteLength) {
      return { arrayBuffer: async () => bytes.slice(start, end).buffer }
    },
    arrayBuffer: async () => bytes.slice().buffer,
  } as File
}

async function waitForWorker(workers: readonly FakeWorker[]): Promise<FakeWorker> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const worker = workers.at(0)
    if (worker) {
      return worker
    }
    await Promise.resolve()
  }

  throw new Error('Worker was not created')
}

const successfulResult: SpreadsheetParseResult = {
  ok: true,
  table: { kind: 'xlsx', sheetName: 'Sayfa1', rows: [['Ürün']] },
}

describe('parseSpreadsheet worker boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('transfers the validated XLSX byte buffer and cleans up after a result', async () => {
    const workers: FakeWorker[] = []
    const file = spreadsheetFile(
      'stok.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x12]),
    )
    const resultPromise = parseSpreadsheet(file, {
      workerFactory: () => {
        const worker = new FakeWorker()
        workers.push(worker)
        return worker as unknown as Worker
      },
    })

    const worker = await waitForWorker(workers)
    expect(worker.postedMessage?.kind).toBe('xlsx')
    expect(worker.postedMessage?.bytes).toBeInstanceOf(ArrayBuffer)
    expect(worker.transfer).toEqual([worker.postedMessage?.bytes])

    worker.emitResult(successfulResult)

    await expect(resultPromise).resolves.toEqual(successfulResult)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(worker.listenerCount()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('returns TIMEOUT after the XLSX deadline and releases resources once', async () => {
    const workers: FakeWorker[] = []
    const resultPromise = parseSpreadsheet(
      spreadsheetFile(
        'stok.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      ),
      {
        workerFactory: () => {
          const worker = new FakeWorker()
          workers.push(worker)
          return worker as unknown as Worker
        },
      },
    )

    const worker = await waitForWorker(workers)
    await vi.advanceTimersByTimeAsync(SPREADSHEET_LIMITS.xlsxTimeoutMs)

    await expect(resultPromise).resolves.toMatchObject({ ok: false, code: 'TIMEOUT' })
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(worker.listenerCount()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses the shorter CSV deadline', async () => {
    const workers: FakeWorker[] = []
    const resultPromise = parseSpreadsheet(
      spreadsheetFile('stok.csv', 'text/csv', new TextEncoder().encode('Ürün\nÇay')),
      {
        workerFactory: () => {
          const worker = new FakeWorker()
          workers.push(worker)
          return worker as unknown as Worker
        },
      },
    )

    await waitForWorker(workers)
    await vi.advanceTimersByTimeAsync(SPREADSHEET_LIMITS.csvTimeoutMs - 1)
    expect(workers[0].terminate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    await expect(resultPromise).resolves.toMatchObject({ ok: false, code: 'TIMEOUT' })
    expect(workers[0].terminate).toHaveBeenCalledTimes(1)
  })

  it('terminates the worker and removes abort handling when cancelled', async () => {
    const workers: FakeWorker[] = []
    const signal = new TrackingAbortSignal()
    const resultPromise = parseSpreadsheet(
      spreadsheetFile(
        'stok.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      ),
      {
        signal: signal as unknown as AbortSignal,
        workerFactory: () => {
          const worker = new FakeWorker()
          workers.push(worker)
          return worker as unknown as Worker
        },
      },
    )

    const worker = await waitForWorker(workers)
    signal.abort()

    await expect(resultPromise).resolves.toMatchObject({ ok: false, code: 'ORGANIZATION_CHANGED' })
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(worker.listenerCount()).toBe(0)
    expect(signal.listenerCount()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('terminates immediately when cancellation happens while the worker is being created', async () => {
    const workers: FakeWorker[] = []
    const signal = new TrackingAbortSignal()
    const resultPromise = parseSpreadsheet(
      spreadsheetFile(
        'stok.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      ),
      {
        signal: signal as unknown as AbortSignal,
        workerFactory: () => {
          signal.abort()
          const worker = new FakeWorker()
          workers.push(worker)
          return worker as unknown as Worker
        },
      },
    )

    const worker = await waitForWorker(workers)
    await vi.advanceTimersByTimeAsync(SPREADSHEET_LIMITS.xlsxTimeoutMs)

    await expect(resultPromise).resolves.toMatchObject({ ok: false, code: 'ORGANIZATION_CHANGED' })
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(worker.listenerCount()).toBe(0)
    expect(signal.listenerCount()).toBe(0)
  })

  it('maps worker errors to INVALID_WORKBOOK and releases resources once', async () => {
    const workers: FakeWorker[] = []
    const resultPromise = parseSpreadsheet(
      spreadsheetFile(
        'stok.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      ),
      {
        workerFactory: () => {
          const worker = new FakeWorker()
          workers.push(worker)
          return worker as unknown as Worker
        },
      },
    )

    const worker = await waitForWorker(workers)
    worker.emitError()

    await expect(resultPromise).resolves.toMatchObject({ ok: false, code: 'INVALID_WORKBOOK' })
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(worker.listenerCount()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
