import type { SupabaseClient } from '@supabase/supabase-js'

type StockMovementInput = {
  materialId: string
  movementType: string
  quantity: number
  unitPrice: number
  note: string | null
}

export async function recordStockMovement(
  supabase: SupabaseClient,
  organizationId: string,
  input: StockMovementInput,
): Promise<void> {
  const { error } = await supabase.rpc('record_stock_movement', {
    p_material_id: input.materialId,
    p_movement_type: input.movementType,
    p_quantity: input.quantity,
    p_unit_price: input.unitPrice,
    p_note: input.note,
    p_organization_id: organizationId,
  })

  if (error) throw new Error(error.message)
}

export async function applyStockCount(
  supabase: SupabaseClient,
  organizationId: string,
  items: Array<{ material_id: string; counted_quantity: number }>,
): Promise<number> {
  const { data, error } = await supabase.rpc('apply_stock_count', {
    p_items: items,
    p_organization_id: organizationId,
  })

  if (error) throw new Error(error.message)
  const result = data as { updated_count?: number | string } | null
  return Number(result?.updated_count ?? items.length)
}
