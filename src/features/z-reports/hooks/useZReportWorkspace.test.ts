import { beforeEach, describe, expect, it, vi } from 'vitest'

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111'

const mocks = vi.hoisted(() => ({
  stateIndex: 0,
  stateValues: [] as unknown[],
  setValues: [] as unknown[],
  refIndex: 0,
  refValues: [] as unknown[],
  effectIndex: 0,
  organizationCleanup: undefined as (() => void) | undefined,
  showAlert: vi.fn().mockResolvedValue(undefined),
  showConfirm: vi.fn().mockResolvedValue(false),
  devError: vi.fn(),
  persistZReportWrite: vi.fn(),
  validateOrganizationDocument: vi.fn(() => null),
  coordinator: {
    run: vi.fn(),
    cancel: vi.fn(),
  },
}))

vi.mock('react', () => ({
  useCallback: <T>(callback: T) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    const index = mocks.effectIndex++
    if (index === 0) {
      const cleanup = effect()
      mocks.organizationCleanup = typeof cleanup === 'function' ? cleanup : undefined
    }
  },
  useMemo: <T>(factory: () => T) => factory(),
  useRef: <T>(value: T) => {
    const index = mocks.refIndex++
    return { current: index in mocks.refValues ? (mocks.refValues[index] as T) : value }
  },
  useState: <T>(initialValue: T | (() => T)) => {
    const index = mocks.stateIndex++
    const initial = typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue
    const value = index in mocks.stateValues ? (mocks.stateValues[index] as T) : initial
    return [value, vi.fn((nextValue: T) => mocks.setValues.push(nextValue))]
  },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({ from: vi.fn() }) }))
vi.mock('@/components/NotificationProvider', () => ({
  useNotification: () => ({ showAlert: mocks.showAlert, showConfirm: mocks.showConfirm }),
}))
vi.mock('@/context/OrganizationContext', () => ({
  useOrganization: () => ({ activeOrg: { id: ORGANIZATION_ID } }),
}))
vi.mock('@/lib/debug', () => ({ devError: mocks.devError }))
vi.mock('@/lib/imagePreprocess', () => ({ dataUrlToFile: vi.fn() }))
vi.mock('@/features/documents', () => ({
  persistZReportWrite: mocks.persistZReportWrite,
  validateOrganizationDocument: mocks.validateOrganizationDocument,
}))
vi.mock('@/features/products/services/product-service', () => ({ saveProductWithRecipe: vi.fn() }))
vi.mock('../services/z-report-service', () => ({ findExistingZReportBatch: vi.fn(), processZReport: vi.fn() }))
vi.mock('@/features/spreadsheets/spreadsheet-parse-coordinator', () => ({
  createSpreadsheetParseCoordinator: () => mocks.coordinator,
}))

import { useZReportWorkspace } from './useZReportWorkspace'

function file(name: string, type: string): File {
  return { name, type, size: 32 } as File
}

function upload(source: File) {
  return {
    target: { files: [source], value: 'chosen-file' },
  } as unknown as React.ChangeEvent<HTMLInputElement>
}

function setAnalysisReadyState() {
  mocks.refValues = [ORGANIZATION_ID, 0, 0, null, false, null]
  mocks.stateValues[0] = 'data:image/png;base64,aGVsbG8='
  mocks.stateValues[3] = 'image'
  mocks.stateValues[12] = ORGANIZATION_ID
}

describe('Z-report spreadsheet source handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.stateIndex = 0
    mocks.stateValues = []
    mocks.setValues = []
    mocks.refIndex = 0
    mocks.refValues = []
    mocks.effectIndex = 0
    mocks.organizationCleanup = undefined
    mocks.coordinator.run.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      result: { ok: true, table: { kind: 'xlsx', sheetName: 'Z Raporu', rows: [['Çay', 2]] } },
    })
    vi.stubGlobal(
      'FileReader',
      class {
        readAsArrayBuffer() {}
        readAsDataURL() {}
        readAsText() {}
      },
    )
  })

  it('rejects legacy XLS files before they can be parsed or stored', async () => {
    await useZReportWorkspace().handleFileUpload(upload(file('gun-sonu.xls', 'application/vnd.ms-excel')))

    expect(mocks.showAlert).toHaveBeenCalledWith('Bu dosya türü desteklenmiyor. XLSX veya CSV seçin.', 'warning')
    expect(mocks.coordinator.run).not.toHaveBeenCalled()
    expect(mocks.persistZReportWrite).not.toHaveBeenCalled()
  })

  it('accepts XLSX and CSV through the bounded coordinator without saving before review', async () => {
    const workspace = useZReportWorkspace()

    await workspace.handleFileUpload(
      upload(file('gun-sonu.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
    )
    mocks.coordinator.run.mockResolvedValueOnce({
      organizationId: ORGANIZATION_ID,
      result: { ok: true, table: { kind: 'csv', sheetName: 'Z Raporu', rows: [['Su', 0]] } },
    })
    await workspace.handleFileUpload(upload(file('gun-sonu.csv', 'text/csv')))

    expect(mocks.coordinator.run).toHaveBeenNthCalledWith(1, expect.anything(), ORGANIZATION_ID)
    expect(mocks.coordinator.run).toHaveBeenNthCalledWith(2, expect.anything(), ORGANIZATION_ID)
    expect(mocks.setValues).toContain('[["Çay",2]]')
    expect(mocks.setValues).toContain('[["Su",0]]')
    expect(mocks.persistZReportWrite).not.toHaveBeenCalled()
  })

  it('surfaces the typed timeout message and does not expose parser internals', async () => {
    mocks.coordinator.run.mockResolvedValueOnce({
      organizationId: ORGANIZATION_ID,
      result: { ok: false, code: 'TIMEOUT', message: 'Dosyanın işlenmesi güvenli süre sınırını aştı.' },
    })

    await useZReportWorkspace().handleFileUpload(
      upload(file('gun-sonu.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
    )

    expect(mocks.showAlert).toHaveBeenCalledWith('Dosyanın işlenmesi güvenli süre sınırını aştı.', 'warning')
    expect(mocks.showAlert).not.toHaveBeenCalledWith(expect.stringContaining('internal'), 'warning')
  })

  it('cancels and suppresses a late spreadsheet result after a newer source is selected', async () => {
    let resolveFirstParse: ((value: unknown) => void) | undefined
    mocks.coordinator.run.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstParse = resolve
        }),
    )

    const workspace = useZReportWorkspace()
    const firstUpload = workspace.handleFileUpload(
      upload(file('onceki.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
    )
    await workspace.handleFileUpload(upload(file('yeni.csv', 'text/csv')))
    resolveFirstParse?.({
      organizationId: ORGANIZATION_ID,
      result: { ok: true, table: { kind: 'xlsx', sheetName: 'Z Raporu', rows: [['GEÇ', 1]] } },
    })
    await firstUpload

    expect(mocks.coordinator.cancel).toHaveBeenCalled()
    expect(mocks.setValues).not.toContain('[["GEÇ",1]]')
  })

  it('cancels in-flight spreadsheet parsing when the active organization lifecycle is cleaned up', () => {
    useZReportWorkspace()

    mocks.organizationCleanup?.()

    expect(mocks.coordinator.cancel).toHaveBeenCalled()
  })
})

describe('Z-report analysis errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.stateIndex = 0
    mocks.stateValues = []
    mocks.setValues = []
    mocks.refIndex = 0
    mocks.effectIndex = 0
    setAnalysisReadyState()
  })

  it('logs API detail but only shows a stable Turkish message to the user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Gemini provider and Zod internal detail' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await useZReportWorkspace().analyze()

    expect(mocks.showAlert).toHaveBeenCalledWith('Z Raporu analiz edilemedi. Lütfen tekrar deneyin.', 'error')
    expect(mocks.showAlert).not.toHaveBeenCalledWith(expect.stringContaining('provider'), 'error')
    expect(mocks.devError).toHaveBeenCalledWith('Z Raporu analiz edilemedi.', expect.any(Error))
    vi.unstubAllGlobals()
  })

  it('preserves the safe daily quota message returned with HTTP 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Günlük limit doldu, yarın tekrar deneyin.' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await useZReportWorkspace().analyze()

    expect(mocks.showAlert).toHaveBeenCalledWith('Günlük limit doldu, yarın tekrar deneyin.', 'warning')
    expect(mocks.devError).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
