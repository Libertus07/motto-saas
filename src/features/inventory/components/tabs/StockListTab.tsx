import { useMemo, useState } from 'react'

import { StockDesktopTable } from '../stock/StockDesktopTable'
import { StockListFilters, type StockStatusFilter } from '../stock/StockListFilters'
import { StockMobileCards } from '../stock/StockMobileCards'
import { isCriticalStock, type StockListViewProps } from '../stock/stock-list-types'

export function StockListTab(props: StockListViewProps) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StockStatusFilter>('tumu')

  const filteredMaterials = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR')

    return props.materials.filter((material) => {
      const matchesSearch = !normalizedSearch || material.name.toLocaleLowerCase('tr-TR').includes(normalizedSearch)
      if (!matchesSearch || status === 'tumu') return matchesSearch

      const isCritical = isCriticalStock(material)
      return status === 'kritik' ? isCritical : !isCritical
    })
  }, [props.materials, search, status])

  const viewProps = { ...props, materials: filteredMaterials }

  return (
    <div className="space-y-4">
      <StockListFilters
        search={search}
        status={status}
        totalCount={props.materials.length}
        onSearchChange={setSearch}
        onStatusChange={setStatus}
      />
      <div className="overflow-hidden rounded-2xl border border-stone-800/80 bg-stone-900/80 shadow-xl backdrop-blur-md">
        <StockDesktopTable {...viewProps} />
        <StockMobileCards {...viewProps} />
      </div>
    </div>
  )
}
