import { parseSpreadsheetBytes } from './spreadsheet-parser-core'
import type { SpreadsheetKind, SpreadsheetParseResult } from './spreadsheet-types'

type ParseRequest = {
  type: 'parse'
  id: string
  kind: SpreadsheetKind
  bytes: ArrayBuffer
}

type ParseResponse = {
  type: 'result'
  id: string
  result: SpreadsheetParseResult
}

const invalidWorkbook: SpreadsheetParseResult = {
  ok: false,
  code: 'INVALID_WORKBOOK',
  message: 'Dosya okunamadı veya beklenen tablo yapısına sahip değil.',
}

self.addEventListener('message', (event: MessageEvent<ParseRequest>) => {
  const { data } = event
  if (data?.type !== 'parse') {
    return
  }

  let result: SpreadsheetParseResult
  try {
    result = parseSpreadsheetBytes({ kind: data.kind, bytes: new Uint8Array(data.bytes) })
  } catch {
    result = invalidWorkbook
  }

  const response: ParseResponse = { type: 'result', id: data.id, result }
  self.postMessage(response)
})
