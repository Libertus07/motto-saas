import type { Material, Movement } from './types'

export function calculateInventoryMetrics(materials: Material[], movements: Movement[], now = new Date()) {
  let totalStockValue = 0
  let criticalMaterialsCount = 0
  for (const material of materials) {
    totalStockValue += (material.stock_quantity || 0) * (material.price_per_unit || 0)
    if ((material.critical_stock_level || 0) > 0 && (material.stock_quantity || 0) <= material.critical_stock_level) {
      criticalMaterialsCount += 1
    }
  }

  let currentMonthLossCost = 0
  for (const movement of movements) {
    if (movement.movement_type !== 'fire') continue
    const movementDate = new Date(movement.created_at)
    if (movementDate.getMonth() === now.getMonth() && movementDate.getFullYear() === now.getFullYear()) {
      currentMonthLossCost += movement.quantity * (movement.unit_price || 0)
    }
  }

  return {
    totalMaterialsCount: materials.length,
    totalStockValue,
    criticalMaterialsCount,
    currentMonthLossCost,
  }
}
