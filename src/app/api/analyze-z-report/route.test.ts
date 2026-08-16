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

function createRequest() {
  return new Request('http://localhost/api/analyze-z-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: 'data:image/png;base64,aGVsbG8=' }),
  })
}

describe('POST /api/analyze-z-report', () => {
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

  it('logs provider failures without exposing their technical detail', async () => {
    const providerError = new Error('Gemini provider key and internal stack detail')
    mocks.generateContent.mockRejectedValue(providerError)

    const response = await POST(createRequest())
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Z Raporu analiz edilemedi. Lütfen tekrar deneyin.' })
    expect(JSON.stringify(body)).not.toContain('provider key')
    expect(mocks.devError).toHaveBeenCalledWith('Z-Report parsing error:', providerError)
  })

  it('logs schema failures without exposing Zod issue details', async () => {
    mocks.generateContent.mockResolvedValue({
      response: { text: () => JSON.stringify({ items: [{ product_name: 42 }] }) },
    })

    const response = await POST(createRequest())
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Z Raporu analiz edilemedi. Lütfen tekrar deneyin.' })
    expect(JSON.stringify(body)).not.toContain('number')
    expect(mocks.devError).toHaveBeenCalledWith('Z-Report parsing error:', expect.any(Error))
  })
})
