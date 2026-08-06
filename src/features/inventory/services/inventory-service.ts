import type { SupabaseClient } from '@supabase/supabase-js'

import type { Material, Movement } from '../types'

type StockMovementInput = {
  materialId: string
  movementType: string
  quantity: number
  unitPrice: number
  note: string | null
}

export type InventoryWorkspaceData = {
  materials: Material[]
  movements: Movement[]
  inventoryCountDay: number
  lastCountDate: Date | null
}

export async function fetchInventoryWorkspace(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<InventoryWorkspaceData> {
  const [materialsResult, movementsResult, settingsResult] = await Promise.all([
    supabase.from('materials').select('*').eq('organization_id', organizationId).order('name'),
    supabase
      .from('stock_movements')
      .select('*, materials!stock_movements_material_tenant_fk(name, unit)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false }),
    supabase
      .from('settings')
      .select('key, value')
      .eq('organization_id', organizationId)
      .in('key', ['inventory_count_day', 'last_inventory_count_date']),
  ])

  const error = materialsResult.error ?? movementsResult.error ?? settingsResult.error
  if (error) throw new Error(error.message)

  const countDay = settingsResult.data?.find((setting) => setting.key === 'inventory_count_day')
  const lastDate = settingsResult.data?.find((setting) => setting.key === 'last_inventory_count_date')

  return {
    materials: (materialsResult.data ?? []) as Material[],
    movements: (movementsResult.data ?? []) as Movement[],
    inventoryCountDay: Number.parseInt(countDay?.value ?? '1', 10) || 1,
    lastCountDate: lastDate?.value ? new Date(lastDate.value) : null,
  }
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
