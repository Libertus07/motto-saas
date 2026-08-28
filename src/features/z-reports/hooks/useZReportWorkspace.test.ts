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
  routerPush: vi.fn(),
  showAlert: vi.fn().mockResolvedValue(undefined),
  showConfirm: vi.fn().mockResolvedValue(false),
  devError: vi.fn(),
  persistZReportWrite: vi.fn(),
  validateOrganizationDocument: vi.fn(() => null),
  findExistingZReportBatch: vi.fn(),
  processZReport: vi.fn(),
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
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.routerPush }) }))
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
vi.mock('../services/z-report-service', () => ({
  findExistingZReportBatch: mocks.findExistingZReportBatch,
  processZReport: mocks.processZReport,
}))
vi.mock('@/features/spreadsheets/spreadsheet-parse-coordinator', () => ({
  createSpreadsheetParseCoordinator: () => mocks.coordinator,
}))

import { useZReportWorkspace } from './useZReportWorkspace'
import { createZReportWorkflowSession } from '../services/z-report-workflow-session'

function file(name: string, type: string): File {
  return { name, type, size: 32 } as File
}

function upload(source: File) {
  return {
    target: { files: [source], value: 'chosen-file' },
  } as unknown as React.ChangeEvent<HTMLInputElement>
}

function setAnalysisReadyState() {
  const workflow = createZReportWorkflowSession()
  const generation = workflow.beginSource(ORGANIZATION_ID)
  workflow.stage(generation, null)
  const attempt = workflow.beginAnalysis(ORGANIZATION_ID)
  if (attempt) {
    workflow.markReviewed(attempt, ORGANIZATION_ID)
    workflow.finishAnalysis(attempt, ORGANIZATION_ID)
  }
  mocks.refValues = [ORGANIZATION_ID, generation, false, null]
  mocks.stateValues[14] = workflow
  mocks.stateValues[0] = 'data:image/png;base64,aGVsbG8='
  mocks.stateValues[3] = 'image'
  mocks.stateValues[12] = ORGANIZATION_ID
}

function setApprovalReadyState(document: File | null) {
  const workflow = createZReportWorkflowSession()
  const generation = workflow.beginSource(ORGANIZATION_ID)
  workflow.stage(generation, document)
  const analysis = workflow.beginAnalysis(ORGANIZATION_ID)
  if (analysis) {
    workflow.markReviewed(analysis, ORGANIZATION_ID)
    workflow.finishAnalysis(analysis, ORGANIZATION_ID)
  }
  mocks.refValues = [ORGANIZATION_ID, generation, false, null]
  mocks.stateValues[14] = workflow
  mocks.stateValues[1] = document === null ? file('should-not-persist.xlsx', 'application/octet-stream') : null
  mocks.stateValues[6] = {
    date: '2026-08-28',
    total_revenue: 0,
    payment_methods: { cash: 0, credit_card: 0, other: 0 },
    items: [],
    expenses: [],
  }
  mocks.stateValues[12] = ORGANIZATION_ID
  return workflow
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
    mocks.findExistingZReportBatch.mockResolvedValue(undefined)
    mocks.processZReport.mockResolvedValue('batch-id')
    mocks.persistZReportWrite.mockImplementation(
      async (_supabase, _organizationId, _document, persist: (documentReference: string | null) => Promise<unknown>) =>
        persist('organization-document-reference'),
    )
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

  it.each([
    ['gun-sonu.xls', 'application/vnd.ms-excel'],
    ['gun-sonu.xlsm', 'application/vnd.ms-excel.sheet.macroEnabled.12'],
  ])('rejects legacy or macro-enabled %s files before they can be parsed or stored', async (name, type) => {
    await useZReportWorkspace().handleFileUpload(upload(file(name, type)))

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

  it('starts only one analysis request for overlapping attempts on the same source', async () => {
    let resolveFetch: ((response: Response) => void) | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve
          }),
      ),
    )
    const workspace = useZReportWorkspace()

    const first = workspace.analyze()
    const second = workspace.analyze()

    expect(fetch).toHaveBeenCalledTimes(1)
    resolveFetch?.(
      new Response(
        JSON.stringify({ date: '2026-08-28', total_revenue: 0, payment_methods: {}, items: [], expenses: [] }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    )
    await Promise.all([first, second])
    vi.unstubAllGlobals()
  })

  it('suppresses a late analysis rejection after the source is invalidated', async () => {
    let rejectFetch: ((error: Error) => void) | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((_resolve, reject) => {
            rejectFetch = reject
          }),
      ),
    )
    const workflow = mocks.stateValues[14] as { invalidate(): void }
    const pending = useZReportWorkspace().analyze()

    workflow.invalidate()
    rejectFetch?.(new Error('late internal parser failure'))
    await pending

    expect(mocks.showAlert).not.toHaveBeenCalled()
    expect(mocks.devError).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('Z-report approval', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.stateIndex = 0
    mocks.stateValues = []
    mocks.setValues = []
    mocks.refIndex = 0
    mocks.effectIndex = 0
    mocks.findExistingZReportBatch.mockResolvedValue(undefined)
    mocks.processZReport.mockResolvedValue('batch-id')
    mocks.persistZReportWrite.mockImplementation(
      async (_supabase, _organizationId, _document, persist: (documentReference: string | null) => Promise<unknown>) =>
        persist('organization-document-reference'),
    )
  })

  it('persists the reviewed XLSX document through the existing atomic Z-report path', async () => {
    const xlsx = file('gun-sonu.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setApprovalReadyState(xlsx)

    await useZReportWorkspace().approve()

    expect(mocks.persistZReportWrite).toHaveBeenCalledWith(
      expect.anything(),
      ORGANIZATION_ID,
      xlsx,
      expect.any(Function),
      ORGANIZATION_ID,
      expect.any(Function),
    )
    expect(mocks.processZReport).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ documentUrl: 'organization-document-reference' }),
    )
    expect(mocks.routerPush).toHaveBeenCalledWith('/dashboard/raporlar')
  })

  it('passes null for reviewed CSV persistence while still approving the financial write', async () => {
    setApprovalReadyState(null)

    await useZReportWorkspace().approve()

    expect(mocks.persistZReportWrite).toHaveBeenCalledWith(
      expect.anything(),
      ORGANIZATION_ID,
      null,
      expect.any(Function),
      ORGANIZATION_ID,
      expect.any(Function),
    )
    expect(mocks.processZReport).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ documentUrl: 'organization-document-reference' }),
    )
  })

  it('suppresses a duplicate approval before a second financial write can start', async () => {
    setApprovalReadyState(file('gun-sonu.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
    const workspace = useZReportWorkspace()

    await Promise.all([workspace.approve(), workspace.approve()])

    expect(mocks.persistZReportWrite).toHaveBeenCalledTimes(1)
  })

  it('does not navigate after the success notification invalidates the source', async () => {
    const workflow = setApprovalReadyState(
      file('gun-sonu.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    )
    mocks.showAlert.mockImplementation(async (message: string) => {
      if (message === 'Z Raporu başarıyla işlendi ve stoklar düşüldü!') workflow.invalidate()
    })

    await useZReportWorkspace().approve()

    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('suppresses a late approval rejection after the source is invalidated', async () => {
    const workflow = setApprovalReadyState(
      file('gun-sonu.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    )
    let rejectWrite: ((error: Error) => void) | undefined
    mocks.persistZReportWrite.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectWrite = reject
        }),
    )

    const pending = useZReportWorkspace().approve()
    await Promise.resolve()
    workflow.invalidate()
    rejectWrite?.(new Error('late atomic write failure'))
    await pending

    expect(mocks.showAlert).not.toHaveBeenCalled()
    expect(mocks.devError).not.toHaveBeenCalled()
  })
})
