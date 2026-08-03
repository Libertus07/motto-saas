import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { applyStockCount, recordStockMovement } from './inventory-service'

describe('inventory mutation service', () => {
  it('records a movement with the active tenant in one RPC call', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const supabase = { rpc } as unknown as SupabaseClient

    await recordStockMovement(supabase, 'org-1', {
      materialId: 'material-1',
      movementType: 'cikis',
      quantity: 2,
      unitPrice: 4.5,
      note: 'Test',
    })

    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledWith('record_stock_movement', {
      p_material_id: 'material-1',
      p_movement_type: 'cikis',
      p_quantity: 2,
      p_unit_price: 4.5,
      p_note: 'Test',
      p_organization_id: 'org-1',
    })
  })

  it('applies a complete count atomically and returns the updated count', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { updated_count: 2 }, error: null })
    const supabase = { rpc } as unknown as SupabaseClient
    const items = [
      { material_id: 'm1', counted_quantity: 4 },
      { material_id: 'm2', counted_quantity: 7 },
    ]

    await expect(applyStockCount(supabase, 'org-1', items)).resolves.toBe(2)
    expect(rpc).toHaveBeenCalledWith('apply_stock_count', {
      p_items: items,
      p_organization_id: 'org-1',
    })
  })

  it('surfaces database errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'Yetersiz stok' } })
    const supabase = { rpc } as unknown as SupabaseClient

    await expect(
      recordStockMovement(supabase, 'org-1', {
        materialId: 'm1',
        movementType: 'cikis',
        quantity: 99,
        unitPrice: 1,
        note: null,
      }),
    ).rejects.toThrow('Yetersiz stok')
  })
})
