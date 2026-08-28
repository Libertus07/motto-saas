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
  live: false,
  liveOrganizationId: '11111111-1111-4111-8111-111111111111',
  liveStateIndex: 0,
  liveStates: [] as unknown[],
  liveRefIndex: 0,
  liveRefs: [] as { current: unknown }[],
  liveCallbackIndex: 0,
  liveCallbacks: [] as { deps: unknown[] | undefined; value: unknown }[],
  liveEffectIndex: 0,
  liveEffects: [] as { deps: unknown[] | undefined; cleanup: (() => void) | undefined }[],
}))

vi.mock('react', () => ({
  useCallback: <T>(callback: T, deps?: unknown[]) => {
    if (!mocks.live) return callback
    const index = mocks.liveCallbackIndex++
    const previous = mocks.liveCallbacks[index]
    const changed =
      !previous ||
      previous.deps?.length !== deps?.length ||
      previous.deps?.some((value, dependencyIndex) => value !== deps?.[dependencyIndex])
    if (changed) mocks.liveCallbacks[index] = { deps, value: callback }
    return mocks.liveCallbacks[index].value as T
  },
  useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
    if (mocks.live) {
      const index = mocks.liveEffectIndex++
      const previous = mocks.liveEffects[index]
      const changed =
        !previous ||
        previous.deps?.length !== deps?.length ||
        previous.deps?.some((value, dependencyIndex) => value !== deps?.[dependencyIndex])
      if (changed) {
        previous?.cleanup?.()
        const cleanup = effect()
        mocks.liveEffects[index] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined }
      }
      return
    }
    const index = mocks.effectIndex++
    if (index === 0) {
      const cleanup = effect()
      mocks.organizationCleanup = typeof cleanup === 'function' ? cleanup : undefined
    }
  },
  useMemo: <T>(factory: () => T) => factory(),
  useRef: <T>(value: T) => {
    if (mocks.live) {
      const index = mocks.liveRefIndex++
      if (!mocks.liveRefs[index]) mocks.liveRefs[index] = { current: value }
      return mocks.liveRefs[index] as { current: T }
    }
    const index = mocks.refIndex++
    return { current: index in mocks.refValues ? (mocks.refValues[index] as T) : value }
  },
  useState: <T>(initialValue: T | (() => T)) => {
    if (mocks.live) {
      const index = mocks.liveStateIndex++
      const initial = typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue
      if (!(index in mocks.liveStates)) mocks.liveStates[index] = initial
      return [
        mocks.liveStates[index] as T,
        (nextValue: T | ((current: T) => T)) => {
          const current = mocks.liveStates[index] as T
          mocks.liveStates[index] =
            typeof nextValue === 'function' ? (nextValue as (current: T) => T)(current) : nextValue
        },
      ]
    }
    const index = mocks.stateIndex++
    const initial = typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue
    const value = index in mocks.stateValues ? (mocks.stateValues[index] as T) : initial
    return [value, vi.fn((nextValue: T) => mocks.setValues.push(nextValue))]
  },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.routerPush }) }))
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: [] })) })) })),
  }),
}))
vi.mock('@/components/NotificationProvider', () => ({
  useNotification: () => ({ showAlert: mocks.showAlert, showConfirm: mocks.showConfirm }),
}))
vi.mock('@/context/OrganizationContext', () => ({
  useOrganization: () => ({ activeOrg: { id: mocks.live ? mocks.liveOrganizationId : ORGANIZATION_ID } }),
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

function resetLiveRender() {
  mocks.liveStateIndex = 0
  mocks.liveRefIndex = 0
  mocks.liveCallbackIndex = 0
  mocks.liveEffectIndex = 0
}

function useLiveWorkspace() {
  resetLiveRender()
  return useZReportWorkspace()
}

describe('Z-report workspace live wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.live = true
    mocks.liveOrganizationId = ORGANIZATION_ID
    mocks.liveStates = []
    mocks.liveRefs = []
    mocks.liveCallbacks = []
    mocks.liveEffects = []
    mocks.coordinator.run.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      result: { ok: true, table: { kind: 'xlsx', sheetName: 'Z Raporu', rows: [['Çay', 2]] } },
    })
    mocks.findExistingZReportBatch.mockResolvedValue(undefined)
    mocks.processZReport.mockResolvedValue('batch-id')
    mocks.persistZReportWrite.mockImplementation(
      async (_supabase, _organizationId, _document, persist: (documentReference: string | null) => Promise<unknown>) =>
        persist('organization-document-reference'),
    )
  })

  it.each([
    ['gun-sonu.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
    ['gun-sonu.csv', 'text/csv', 'csv'],
  ] as const)('wires %s upload through review into one approved persistence write', async (name, type, kind) => {
    mocks.coordinator.run.mockResolvedValueOnce({
      organizationId: ORGANIZATION_ID,
      result: { ok: true, table: { kind, sheetName: 'Z Raporu', rows: [['Çay', 2]] } },
    })
    let workspace = useLiveWorkspace()
    const uploaded = file(name, type)

    await workspace.handleFileUpload(upload(uploaded))
    workspace = useLiveWorkspace()
    expect(workspace.fileText).toBe('[["Çay",2]]')

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ date: '2026-08-28', total_revenue: 0, payment_methods: {}, items: [], expenses: [] }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        ),
    )
    await workspace.analyze()
    workspace = useLiveWorkspace()
    expect(workspace.parsedData).not.toBeNull()

    await workspace.approve()
    expect(mocks.persistZReportWrite).toHaveBeenCalledWith(
      expect.anything(),
      ORGANIZATION_ID,
      kind === 'xlsx' ? uploaded : null,
      expect.any(Function),
      ORGANIZATION_ID,
      expect.any(Function),
    )
    vi.unstubAllGlobals()
  })

  it('invalidates an in-flight upload when the active organization changes on rerender', async () => {
    let resolveParse: ((value: unknown) => void) | undefined
    mocks.coordinator.run.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveParse = resolve
        }),
    )
    let workspace = useLiveWorkspace()
    const pending = workspace.handleFileUpload(
      upload(file('gun-sonu.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
    )

    mocks.liveOrganizationId = '22222222-2222-4222-8222-222222222222'
    workspace = useLiveWorkspace()
    resolveParse?.({
      organizationId: ORGANIZATION_ID,
      result: { ok: true, table: { kind: 'xlsx', sheetName: 'Z Raporu', rows: [['GEÇ', 1]] } },
    })
    await pending
    workspace = useLiveWorkspace()

    expect(mocks.coordinator.cancel).toHaveBeenCalled()
    expect(workspace.fileText).toBeNull()
    expect(workspace.parsedData).toBeNull()
  })

  it('invalidates a pending analysis when reset is called before its response resolves', async () => {
    let resolveFetch: ((response: Response) => void) | undefined
    let workspace = useLiveWorkspace()
    await workspace.handleFileUpload(
      upload(file('gun-sonu.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
    )
    workspace = useLiveWorkspace()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve
          }),
      ),
    )
    const pending = workspace.analyze()
    workspace.reset()
    resolveFetch?.(
      new Response(
        JSON.stringify({ date: '2026-08-28', total_revenue: 0, payment_methods: {}, items: [], expenses: [] }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    )
    await pending
    workspace = useLiveWorkspace()

    expect(workspace.parsedData).toBeNull()
    expect(workspace.fileText).toBeNull()
    vi.unstubAllGlobals()
  })
})
