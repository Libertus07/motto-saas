import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/debug', () => ({ devError: vi.fn() }))

import {
  persistInvestmentReceiptWrite,
  persistSupplierReceiptWrite,
  persistZReportWrite,
} from './financial-document-write-service'

const organizationId = '11111111-1111-4111-8111-111111111111'
const file = new File(['pdf'], 'receipt.pdf', { type: 'application/pdf' })

function createSupabase(uploadError: unknown = null) {
  const upload = vi.fn(async (path: string) => ({
    data: uploadError ? null : { path },
    error: uploadError,
  }))
  const remove = vi.fn().mockResolvedValue({ data: [], error: null })
  const rpc = vi.fn().mockResolvedValue({ data: { ok: true }, error: null })
  const from = vi.fn(() => ({ upload, remove }))
  return {
    supabase: { storage: { from }, rpc } as unknown as SupabaseClient,
    rpc,
  }
}

describe('financial document write service', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: () => '22222222-2222-4222-8222-222222222222' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls the exact supplier RPC with tenant, replacement and stable reference', async () => {
    const { supabase, rpc } = createSupabase()
    await persistSupplierReceiptWrite(
      supabase,
      organizationId,
      file,
      'old-batch',
      { batch_id: 'new-batch' },
      organizationId,
    )

    expect(rpc).toHaveBeenCalledWith('process_receipt_upload', {
      payload: {
        batch_id: 'new-batch',
        organization_id: organizationId,
        replace_batch_id: 'old-batch',
        image_url: `storage://motto_assets/${organizationId}/supplier-receipt/22222222-2222-4222-8222-222222222222.pdf`,
      },
    })
  })

  it('calls the exact investment RPC with tenant, replacement and stable reference', async () => {
    const { supabase, rpc } = createSupabase()
    await persistInvestmentReceiptWrite(
      supabase,
      organizationId,
      file,
      'old-transaction',
      {
        p_organization_id: organizationId,
        p_name: 'Altın',
      },
      organizationId,
    )

    expect(rpc).toHaveBeenCalledWith('buy_investment_transaction', {
      p_organization_id: organizationId,
      p_name: 'Altın',
      p_document_url: `storage://motto_assets/${organizationId}/investment-receipt/22222222-2222-4222-8222-222222222222.pdf`,
      p_replace_transaction_id: 'old-transaction',
    })
  })

  it('forwards the stable Z-report reference to the atomic report callback', async () => {
    const { supabase } = createSupabase()
    const persist = vi.fn().mockResolvedValue({ ok: true })
    await persistZReportWrite(supabase, organizationId, file, persist, organizationId)
    expect(persist).toHaveBeenCalledWith(
      `storage://receipts/${organizationId}/z-report/22222222-2222-4222-8222-222222222222.pdf`,
    )
  })

  it.each(['supplier', 'investment', 'z-report'] as const)(
    'does not start the %s business write after an upload failure',
    async (flow) => {
      const { supabase, rpc } = createSupabase({ message: 'provider secret' })
      const persist = vi.fn()
      const operation =
        flow === 'supplier'
          ? persistSupplierReceiptWrite(supabase, organizationId, file, null, {}, organizationId)
          : flow === 'investment'
            ? persistInvestmentReceiptWrite(supabase, organizationId, file, null, {}, organizationId)
            : persistZReportWrite(supabase, organizationId, file, persist, organizationId)

      await expect(operation).rejects.toThrow('Belge yüklenemedi. Lütfen tekrar deneyin.')
      expect(rpc).not.toHaveBeenCalled()
      expect(persist).not.toHaveBeenCalled()
    },
  )

  it('masks a supplier RPC provider error', async () => {
    const { supabase } = createSupabase()
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'database internals' },
    } as never)
    await expect(persistSupplierReceiptWrite(supabase, organizationId, null, null, {}, organizationId)).rejects.toThrow(
      'Fiş kaydedilemedi. Lütfen tekrar deneyin.',
    )
  })

  it.each(['supplier', 'investment', 'z-report'] as const)(
    'rejects a stale %s write that was prepared for another organization before upload',
    async (flow) => {
      const { supabase, rpc } = createSupabase()
      const persist = vi.fn()
      const staleOrganizationId = '33333333-3333-4333-8333-333333333333'
      const operation =
        flow === 'supplier'
          ? persistSupplierReceiptWrite(supabase, organizationId, file, null, {}, staleOrganizationId)
          : flow === 'investment'
            ? persistInvestmentReceiptWrite(supabase, organizationId, file, null, {}, staleOrganizationId)
            : persistZReportWrite(supabase, organizationId, file, persist, staleOrganizationId)

      await expect(operation).rejects.toThrow('Belge farklı bir işletme için hazırlandı. Lütfen yeniden seçin.')
      expect(rpc).not.toHaveBeenCalled()
      expect(persist).not.toHaveBeenCalled()
    },
  )
})
