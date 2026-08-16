import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  stateIndex: 0,
  showAlert: vi.fn().mockResolvedValue(undefined),
  showConfirm: vi.fn(),
  devError: vi.fn(),
}))

vi.mock('react', () => ({
  useEffect: vi.fn(),
  useMemo: <T>(factory: () => T) => factory(),
  useRef: () => ({ current: '11111111-1111-4111-8111-111111111111' }),
  useState: (initialValue: unknown) => {
    const index = mocks.stateIndex++
    if (index === 0) return ['data:image/png;base64,aGVsbG8=', vi.fn()]
    if (index === 3) return ['image', vi.fn()]
    if (index === 12) return ['11111111-1111-4111-8111-111111111111', vi.fn()]
    return [initialValue, vi.fn()]
  },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({ from: vi.fn() }) }))
vi.mock('@/components/NotificationProvider', () => ({
  useNotification: () => ({ showAlert: mocks.showAlert, showConfirm: mocks.showConfirm }),
}))
vi.mock('@/context/OrganizationContext', () => ({
  useOrganization: () => ({ activeOrg: { id: '11111111-1111-4111-8111-111111111111' } }),
}))
vi.mock('@/lib/debug', () => ({ devError: mocks.devError }))
vi.mock('@/lib/imagePreprocess', () => ({ dataUrlToFile: vi.fn() }))
vi.mock('@/features/documents', () => ({
  persistZReportWrite: vi.fn(),
  validateOrganizationDocument: vi.fn(() => null),
}))
vi.mock('@/features/products/services/product-service', () => ({ saveProductWithRecipe: vi.fn() }))
vi.mock('../services/z-report-service', () => ({ findExistingZReportBatch: vi.fn(), processZReport: vi.fn() }))

import { useZReportWorkspace } from './useZReportWorkspace'

describe('Z-report analysis errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.stateIndex = 0
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
