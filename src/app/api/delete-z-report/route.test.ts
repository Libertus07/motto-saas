import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  devError: vi.fn(),
  from: vi.fn(),
  requireUser: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/debug', () => ({ devError: mocks.devError }))
vi.mock('@/lib/supabase-server', () => ({ requireUser: mocks.requireUser }))

import { POST } from './route'

function createRequest() {
  return new Request('http://localhost/api/delete-z-report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'user-agent': 'technical-user-agent-detail',
      'x-forwarded-for': '203.0.113.10',
    },
    body: JSON.stringify({
      batch_id: 'batch-1',
      organization_id: 'organization-1',
    }),
  })
}

describe('POST /api/delete-z-report', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    mocks.requireUser.mockResolvedValue({
      user: { id: 'user-1' },
      supabase: { from: mocks.from, rpc: mocks.rpc },
    })
  })

  it('deletes through the atomic RPC without issuing a second audit write', async () => {
    const response = await POST(createRequest())
    const body = (await response.json()) as { success: boolean }

    expect(response.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledOnce()
    expect(mocks.rpc).toHaveBeenCalledWith('delete_z_report_transaction', {
      p_batch_id: 'batch-1',
      p_organization_id: 'organization-1',
    })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('logs RPC failures while returning only the stable Turkish error', async () => {
    const rpcError = new Error('internal PostgreSQL relation and policy detail')
    mocks.rpc.mockResolvedValue({ data: null, error: rpcError })

    const response = await POST(createRequest())
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Z-Raporu silinemedi. Lütfen tekrar deneyin.' })
    expect(JSON.stringify(body)).not.toContain('PostgreSQL')
    expect(mocks.devError).toHaveBeenCalledWith('Delete Z-Report Error:', rpcError)
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
