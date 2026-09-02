import { identifySpreadsheetFile, SPREADSHEET_LIMITS } from './spreadsheet-policy'
import type { SpreadsheetErrorCode, SpreadsheetKind, SpreadsheetParseResult } from './spreadsheet-types'

type WorkerRequest = {
  type: 'parse'
  id: string
  kind: SpreadsheetKind
  bytes: ArrayBuffer
}

type WorkerResponse = {
  type: 'result'
  id: string
  result: SpreadsheetParseResult
}

type ReadableSpreadsheet = {
  kind: SpreadsheetKind
  bytes: ArrayBuffer
}

const ERROR_MESSAGES: Readonly<Record<SpreadsheetErrorCode, string>> = {
  UNSUPPORTED_TYPE: 'Bu dosya türü desteklenmiyor. XLSX veya CSV seçin.',
  LIMIT_EXCEEDED: 'Dosya güvenli işlem sınırlarını aşıyor.',
  INVALID_WORKBOOK: 'Dosya okunamadı veya beklenen tablo yapısına sahip değil.',
  UNSAFE_CONTENT: 'Dosya desteklenmeyen veya güvenli olmayan içerik içeriyor.',
  ORGANIZATION_CHANGED: 'İşletme değiştiği için dosya işlemi iptal edildi.',
  TIMEOUT: 'Dosyanın işlenmesi güvenli süre sınırını aştı.',
}

let nextRequestId = 0

const createWorker = () =>
  new Worker(new URL('./spreadsheet-parser.worker.ts', import.meta.url), {
    type: 'module',
  })

function failure(code: SpreadsheetErrorCode): SpreadsheetParseResult {
  return { ok: false, code, message: ERROR_MESSAGES[code] }
}

function aborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false
}

async function readSpreadsheetFile(
  file: File,
  signal: AbortSignal | undefined,
): Promise<ReadableSpreadsheet | SpreadsheetParseResult> {
  if (aborted(signal)) {
    return failure('ORGANIZATION_CHANGED')
  }

  const initialIdentity = identifySpreadsheetFile({
    name: file.name,
    mimeType: file.type,
    size: file.size,
    prefix: new Uint8Array(),
  })
  if (
    !initialIdentity.ok &&
    !initialIdentity.result.ok &&
    (initialIdentity.result.code === 'UNSUPPORTED_TYPE' || initialIdentity.result.code === 'LIMIT_EXCEEDED')
  ) {
    return initialIdentity.result
  }

  const bytes = await file.arrayBuffer()
  if (aborted(signal)) {
    return failure('ORGANIZATION_CHANGED')
  }

  const identity = identifySpreadsheetFile({
    name: file.name,
    mimeType: file.type,
    size: file.size,
    prefix: new Uint8Array(bytes),
  })
  return identity.ok ? { kind: identity.kind, bytes } : identity.result
}

function isResult(value: ReadableSpreadsheet | SpreadsheetParseResult): value is SpreadsheetParseResult {
  return 'ok' in value
}

export async function parseSpreadsheet(
  file: File,
  options: { signal?: AbortSignal; workerFactory?: () => Worker } = {},
): Promise<SpreadsheetParseResult> {
  let readable: ReadableSpreadsheet | SpreadsheetParseResult
  try {
    readable = await readSpreadsheetFile(file, options.signal)
  } catch {
    return failure(aborted(options.signal) ? 'ORGANIZATION_CHANGED' : 'INVALID_WORKBOOK')
  }

  if (isResult(readable)) {
    return readable
  }

  if (aborted(options.signal)) {
    return failure('ORGANIZATION_CHANGED')
  }

  let worker: Worker
  try {
    worker = (options.workerFactory ?? createWorker)()
  } catch {
    return failure(aborted(options.signal) ? 'ORGANIZATION_CHANGED' : 'INVALID_WORKBOOK')
  }

  const id = `spreadsheet-${(nextRequestId += 1)}`
  const timeoutMs = SPREADSHEET_LIMITS[`${readable.kind}TimeoutMs`]

  return new Promise<SpreadsheetParseResult>((resolve) => {
    let settled = false

    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data?.type !== 'result' || event.data.id !== id) {
        return
      }

      settle(event.data.result)
    }
    const onError = () => settle(failure('INVALID_WORKBOOK'))
    const onAbort = () => settle(failure('ORGANIZATION_CHANGED'))

    const cleanup = () => {
      clearTimeout(timeout)
      options.signal?.removeEventListener('abort', onAbort)
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      worker.terminate()
    }

    const settle = (result: SpreadsheetParseResult) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      resolve(result)
    }

    const timeout = setTimeout(() => settle(failure('TIMEOUT')), timeoutMs)
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    options.signal?.addEventListener('abort', onAbort, { once: true })
    if (aborted(options.signal)) {
      settle(failure('ORGANIZATION_CHANGED'))
      return
    }

    try {
      const request: WorkerRequest = { type: 'parse', id, kind: readable.kind, bytes: readable.bytes }
      worker.postMessage(request, [readable.bytes])
    } catch {
      settle(failure('INVALID_WORKBOOK'))
    }
  })
}
