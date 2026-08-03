import type { SupabaseClient } from '@supabase/supabase-js'

import type { Material, MaterialBulkUpdate, MaterialMutationInput, PriceHistory } from '../types'
import { getMaterialCategory } from '../utils'
import { parseMaterialCategories } from '../workspace-utils'

type SettingRow = { key: string; value: unknown }

function throwIfSupabaseError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export async function fetchMaterialWorkspace(supabase: SupabaseClient, organizationId: string) {
  const [materialsResult, settingsResult] = await Promise.all([
    supabase.from('materials').select('*').eq('organization_id', organizationId).order('name'),
    supabase
      .from('settings')
      .select('key, value')
      .eq('organization_id', organizationId)
      .eq('key', 'material_categories'),
  ])

  throwIfSupabaseError(materialsResult.error)
  throwIfSupabaseError(settingsResult.error)
  const setting = (settingsResult.data as SettingRow[] | null)?.find((item) => item.key === 'material_categories')

  const materials = (materialsResult.data ?? []) as Material[]
  const categories = [...new Set([...parseMaterialCategories(setting?.value), ...materials.map(getMaterialCategory)])]

  return { materials, categories }
}

export async function fetchMaterialPriceHistory(
  supabase: SupabaseClient,
  organizationId: string,
  materialId: string,
): Promise<PriceHistory[]> {
  const { data, error } = await supabase
    .from('material_price_history')
    .select('id, old_price, new_price, source, created_at')
    .eq('organization_id', organizationId)
    .eq('material_id', materialId)
    .order('created_at', { ascending: false })
  throwIfSupabaseError(error)
  return (data ?? []) as PriceHistory[]
}

export async function saveMaterial(
  supabase: SupabaseClient,
  organizationId: string,
  input: MaterialMutationInput,
): Promise<string> {
  const { data, error } = await supabase.rpc('save_material', {
    p_organization_id: organizationId,
    p_material_id: input.id ?? null,
    p_name: input.name,
    p_category: input.category,
    p_unit: input.unit,
    p_price_per_unit: input.pricePerUnit,
    p_stock_quantity: input.stockQuantity,
    p_critical_stock_level: input.criticalStockLevel,
    p_audit_details: input.auditDetails ?? {},
  })
  throwIfSupabaseError(error)
  if (typeof data !== 'string') throw new Error('Hammadde kaydı doğrulanamadı.')
  return data
}

export async function bulkUpdateMaterials(
  supabase: SupabaseClient,
  organizationId: string,
  updates: MaterialBulkUpdate[],
  description: string,
  auditDetails: Record<string, unknown>,
): Promise<number> {
  const { data, error } = await supabase.rpc('bulk_update_materials', {
    p_organization_id: organizationId,
    p_updates: updates,
    p_description: description,
    p_audit_details: auditDetails,
  })
  throwIfSupabaseError(error)
  if (typeof data !== 'number') throw new Error('Toplu hammadde güncellemesi doğrulanamadı.')
  return data
}

export async function deleteMaterials(
  supabase: SupabaseClient,
  organizationId: string,
  materialIds: string[],
  description: string,
  auditDetails: Record<string, unknown>,
): Promise<number> {
  const { data, error } = await supabase.rpc('delete_materials', {
    p_organization_id: organizationId,
    p_material_ids: materialIds,
    p_description: description,
    p_audit_details: auditDetails,
  })
  throwIfSupabaseError(error)
  if (typeof data !== 'number') throw new Error('Hammadde silme işlemi doğrulanamadı.')
  return data
}
