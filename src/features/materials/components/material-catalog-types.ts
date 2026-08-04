import type { EditRow, Material, MaterialCategoryGroup } from '../types'

export type MaterialCatalogProps = {
  loading: boolean
  groups: MaterialCategoryGroup[]
  openCategories: ReadonlySet<string>
  bulkEditMode: boolean
  editRows: Record<string, EditRow>
  changedIds: ReadonlySet<string>
  selectedForDeletion: ReadonlySet<string>
  onToggleCategory: (category: string) => void
  onRowChange: (id: string, field: keyof EditRow, value: string) => void
  onToggleDeletion: (id: string) => void
  onEdit: (material: Material) => void
  onDelete: (id: string) => void
  onViewHistory: (material: Material) => void
}

export type MaterialCategoryContentProps = Pick<
  MaterialCatalogProps,
  | 'bulkEditMode'
  | 'editRows'
  | 'changedIds'
  | 'selectedForDeletion'
  | 'onRowChange'
  | 'onToggleDeletion'
  | 'onEdit'
  | 'onDelete'
  | 'onViewHistory'
> & { materials: Material[] }
