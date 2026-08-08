import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cleanup: undefined as (() => void) | undefined,
  effect: undefined as (() => void | (() => void)) | undefined,
  createClient: vi.fn(),
  devError: vi.fn(),
  resolveDocumentPreviewUrl: vi.fn(),
  setPreviewReference: vi.fn(),
  setPreviewLoading: vi.fn(),
  setPreviewUrl: vi.fn(),
  showAlert: vi.fn().mockResolvedValue(undefined),
  refs: [] as Array<{ current: unknown }>,
  refIndex: 0,
  stateIndex: 0,
}))

vi.mock('react', () => ({
  useCallback: <T>(callback: T) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    mocks.effect = effect
    mocks.cleanup = effect() || undefined
  },
  useLayoutEffect: (effect: () => void | (() => void)) => {
    mocks.effect = effect
    mocks.cleanup = effect() || undefined
  },
  useMemo: <T>(factory: () => T) => factory(),
  useRef: <T>(initialValue: T) => {
    const index = mocks.refIndex++
    const existing = mocks.refs[index]
    if (existing) return existing as { current: T }
    const ref = { current: initialValue }
    mocks.refs[index] = ref
    return ref
  },
  useState: <T>(initialValue: T) => {
    const setter = [mocks.setPreviewUrl, mocks.setPreviewLoading, mocks.setPreviewReference][mocks.stateIndex++]
    return [initialValue, setter]
  },
}))

vi.mock('@/components/NotificationProvider', () => ({
  useNotification: () => ({ showAlert: mocks.showAlert }),
}))

vi.mock('@/lib/debug', () => ({ devError: mocks.devError }))
vi.mock('@/lib/supabase', () => ({ createClient: mocks.createClient }))
vi.mock('./document-storage-service', () => ({
  resolveDocumentPreviewUrl: mocks.resolveDocumentPreviewUrl,
}))

import { useDocumentPreview } from './useDocumentPreview'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

describe('useDocumentPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cleanup = undefined
    mocks.effect = undefined
    mocks.refs = []
    mocks.refIndex = 0
    mocks.stateIndex = 0
    mocks.createClient.mockReturnValue({ storage: {} })
  })

  it('resolves a stable reference before exposing the short-lived preview URL', async () => {
    const supabase = { from: vi.fn(), storage: {} }
    mocks.createClient.mockReturnValue(supabase)
    mocks.resolveDocumentPreviewUrl.mockResolvedValue('https://signed.example/receipt.pdf?token=short-lived')
    const preview = useDocumentPreview('org-1')

    expect(preview.previewReference).toBeNull()

    await preview.openDocument('storage://motto_assets/org-1/investment-document/document.pdf')

    expect(mocks.resolveDocumentPreviewUrl).toHaveBeenCalledWith(
      supabase,
      'storage://motto_assets/org-1/investment-document/document.pdf',
    )
    expect(mocks.setPreviewLoading.mock.calls.map(([value]) => value)).toEqual([true, false])
    expect(mocks.setPreviewReference.mock.calls.map(([value]) => value)).toEqual([
      'storage://motto_assets/org-1/investment-document/document.pdf',
      null,
    ])
    expect(mocks.setPreviewUrl).toHaveBeenCalledWith('https://signed.example/receipt.pdf?token=short-lived')
    expect(supabase.from).not.toHaveBeenCalled()
    expect(mocks.showAlert).not.toHaveBeenCalled()
  })

  it('logs technical resolution failures but shows only the safe Turkish message', async () => {
    const technicalError = new Error('storage policy denied for tenant org-secret')
    mocks.resolveDocumentPreviewUrl.mockRejectedValue(technicalError)
    const preview = useDocumentPreview('org-1')

    await preview.openDocument('storage://motto_assets/org-1/investment-document/document.pdf')

    expect(mocks.devError).toHaveBeenCalledWith('Belge önizleme bağlantısı çözümlenemedi.', technicalError)
    expect(mocks.showAlert).toHaveBeenCalledWith('Belge görüntülenemedi. Lütfen tekrar deneyin.', 'error')
    expect(mocks.setPreviewUrl).not.toHaveBeenCalled()
    expect(mocks.setPreviewLoading.mock.calls.map(([value]) => value)).toEqual([true, false])
  })

  it('ignores repeated opens while one resolution is pending', async () => {
    const pending = deferred<string>()
    mocks.resolveDocumentPreviewUrl.mockReturnValue(pending.promise)
    const preview = useDocumentPreview('org-1')

    const firstOpen = preview.openDocument('storage://motto_assets/org-1/investment-document/first.pdf')
    const repeatedOpen = preview.openDocument('storage://motto_assets/org-1/investment-document/second.pdf')

    expect(mocks.resolveDocumentPreviewUrl).toHaveBeenCalledTimes(1)
    await repeatedOpen
    pending.resolve('https://signed.example/first.pdf')
    await firstOpen
  })

  it('close invalidates a pending result and allows a newer request without stale overwrite', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    mocks.resolveDocumentPreviewUrl.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const preview = useDocumentPreview('org-1')

    const firstOpen = preview.openDocument('storage://motto_assets/org-1/investment-document/first.pdf')
    preview.closeDocument()
    const secondOpen = preview.openDocument('storage://motto_assets/org-1/investment-document/second.pdf')

    second.resolve('https://signed.example/second.pdf')
    await secondOpen
    first.resolve('https://signed.example/first.pdf')
    await firstOpen

    expect(mocks.setPreviewUrl.mock.calls.map(([value]) => value)).toEqual([null, 'https://signed.example/second.pdf'])
  })

  it('invalidates pending work when its consumer unmounts', async () => {
    const pending = deferred<string>()
    mocks.resolveDocumentPreviewUrl.mockReturnValue(pending.promise)
    const preview = useDocumentPreview('org-1')

    const opening = preview.openDocument('storage://motto_assets/org-1/investment-document/document.pdf')
    mocks.cleanup?.()
    pending.resolve('https://signed.example/stale.pdf')
    await opening

    expect(mocks.setPreviewUrl).not.toHaveBeenCalled()
  })

  it('remains active when React replays the mount effect in strict mode', async () => {
    mocks.resolveDocumentPreviewUrl.mockResolvedValue('https://signed.example/strict-mode.pdf')
    const preview = useDocumentPreview('org-1')

    mocks.cleanup?.()
    mocks.cleanup = mocks.effect?.() || undefined
    await preview.openDocument('storage://motto_assets/org-1/investment-document/document.pdf')

    expect(mocks.setPreviewUrl).toHaveBeenCalledWith('https://signed.example/strict-mode.pdf')
  })

  it('closes the modal and invalidates a pending result when the organization scope changes', async () => {
    const pending = deferred<string>()
    mocks.resolveDocumentPreviewUrl.mockReturnValue(pending.promise)
    const orgAPreview = useDocumentPreview('org-a')

    const opening = orgAPreview.openDocument('storage://motto_assets/org-a/investment-document/document.pdf')

    mocks.cleanup?.()
    mocks.refIndex = 0
    mocks.stateIndex = 0
    useDocumentPreview('org-b')

    pending.resolve('https://signed.example/org-a.pdf')
    await opening

    expect(mocks.setPreviewUrl).toHaveBeenCalledWith(null)
    expect(mocks.setPreviewUrl).not.toHaveBeenCalledWith('https://signed.example/org-a.pdf')
    expect(mocks.setPreviewLoading).toHaveBeenCalledWith(false)
    expect(mocks.setPreviewReference).toHaveBeenCalledWith(null)
  })

  it('does not start authorization without a current organization scope', async () => {
    const preview = useDocumentPreview(null)

    await preview.openDocument('storage://motto_assets/org-a/investment-document/document.pdf')

    expect(mocks.resolveDocumentPreviewUrl).not.toHaveBeenCalled()
    expect(mocks.setPreviewLoading).not.toHaveBeenCalledWith(true)
  })
})
