import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  devError: vi.fn(),
  generateContent: vi.fn(),
  requireUser: vi.fn(),
}))

vi.mock('@/lib/debug', () => ({ devError: mocks.devError }))
vi.mock('@/lib/ai-security', () => ({ isSafeImageUrl: vi.fn(() => false) }))
vi.mock('@/lib/supabase-server', () => ({ requireUser: mocks.requireUser }))
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: mocks.generateContent }
    }
  },
}))

import { POST } from './route'

describe('POST /api/analyze-investment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('GEMINI_API_KEY', 'test-key')
    mocks.requireUser.mockResolvedValue({
      user: { id: 'user-1' },
      supabase: { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('logs provider failures without returning the raw exception to the client', async () => {
    const providerError = new Error('Gemini API key and provider stack detail')
    mocks.generateContent.mockRejectedValue(providerError)
    const request = new Request('http://localhost/api/analyze-investment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: 'data:image/png;base64,aGVsbG8=' }),
    })

    const response = await POST(request)
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Yatırım belgesi analiz edilemedi. Lütfen tekrar deneyin.' })
    expect(JSON.stringify(body)).not.toContain('Gemini API key')
    expect(mocks.devError).toHaveBeenCalledWith('Investment receipt parsing error:', providerError)
  })
})
