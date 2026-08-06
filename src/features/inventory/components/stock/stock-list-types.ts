import type { InlineFormState, Material } from '../../types'

export type StockMovementType = 'giris' | 'cikis'

export type StockListViewProps = {
  materials: Material[]
  inlineMovementMatId: string | null
  inlineMovementType: StockMovementType
  inlineForm: InlineFormState
  onInlineMatIdChange: (id: string, type: StockMovementType) => void
  onInlineFormChange: (form: InlineFormState) => void
  onInlineSubmit: () => void
  onInlineCancel: () => void
}

export function isCriticalStock(material: Material) {
  const criticalLevel = material.critical_stock_level || 0
  return criticalLevel > 0 && (material.stock_quantity || 0) <= criticalLevel
}

export function calculateStockValue(material: Material) {
  return (material.stock_quantity || 0) * material.price_per_unit
}
