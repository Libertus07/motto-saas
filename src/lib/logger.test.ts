import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  insert: vi.fn(),
  from: vi.fn(),
  devError: vi.fn(),
}))

vi.mock('./supabase-server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: mocks.from,
  })),
}))

vi.mock('@/lib/debug', () => ({ devError: mocks.devError }))

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => (name === 'user-agent' ? 'Vitest Browser' : '127.0.0.1'),
  })),
}))

import { logActivity } from './logger'

describe('logActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mocks.rpc.mockResolvedValue({ data: 'organization-2', error: null })
    mocks.insert.mockResolvedValue({ error: null })
    mocks.from.mockReturnValue({ insert: mocks.insert })
  })

  it('writes the audit record to the database-selected active organization', async () => {
    await logActivity('Stok', 'GUNCELLEME', 'Stok güncellendi.', { materialId: 'material-1' })

    expect(mocks.rpc).toHaveBeenCalledWith('current_organization_id')
    expect(mocks.from).toHaveBeenCalledWith('activity_logs')
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'Stok',
        action_type: 'GUNCELLEME',
        user_id: 'user-1',
        organization_id: 'organization-2',
      }),
    )
  })

  it('fails closed when an active organization cannot be resolved', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'missing tenant context' } })

    await logActivity('Stok', 'GUNCELLEME', 'Stok güncellendi.')

    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.devError).toHaveBeenCalledWith(
      'İşlem geçmişi kaydı için aktif organizasyon çözümlenemedi.',
      expect.objectContaining({ message: 'missing tenant context' }),
    )
  })
})
