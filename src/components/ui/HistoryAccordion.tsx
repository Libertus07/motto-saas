'use client'

import React, { useState } from 'react'

export interface HistoryGroup<T> {
  id: string
  title: string
  subtitle?: string
  icon?: React.ReactNode
  items: T[]
}

interface HistoryAccordionProps<T> {
  groups: HistoryGroup<T>[]
  defaultExpandedIds?: string[]
  emptyMessage?: string
  renderHeaderRight?: (group: HistoryGroup<T>) => React.ReactNode
  renderContent: (items: T[], group: HistoryGroup<T>) => React.ReactNode
}

export function HistoryAccordion<T>({ 
  groups, 
  defaultExpandedIds = [],
  emptyMessage = "Kayıt bulunamadı.",
  renderHeaderRight,
  renderContent 
}: HistoryAccordionProps<T>) {
  const [expandedIds, setExpandedIds] = useState<string[]>(defaultExpandedIds)

  const toggle = (id: string) => {
    setExpandedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  if (groups.length === 0) {
    return (
      <div className="bg-stone-900 rounded-2xl border border-stone-800 p-12 text-center text-stone-500 shadow-inner">
        <span className="text-4xl mb-3 block opacity-50">📂</span>
        <p>{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const isExpanded = expandedIds.includes(group.id)

        return (
          <div 
            key={group.id} 
            className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
              isExpanded 
                ? 'bg-stone-900/80 border-amber-500/30 shadow-[0_4px_20px_rgba(245,158,11,0.05)]' 
                : 'bg-stone-900 border-stone-800 hover:border-stone-700'
            }`}
          >
            <button 
              onClick={() => toggle(group.id)}
              className="w-full flex items-center justify-between px-6 py-5 bg-transparent hover:bg-stone-800/30 transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                {group.icon && (
                  <div className={`text-2xl transition-transform duration-300 ${isExpanded ? 'scale-110' : ''}`}>
                    {group.icon}
                  </div>
                )}
                <div>
                  <h3 className={`font-bold text-lg transition-colors ${isExpanded ? 'text-amber-400' : 'text-stone-200'}`}>
                    {group.title}
                  </h3>
                  {group.subtitle && (
                    <p className="text-sm text-stone-500 mt-0.5">{group.subtitle}</p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                {renderHeaderRight && (
                  <div onClick={e => e.stopPropagation()} className="hidden sm:block">
                    {renderHeaderRight(group)}
                  </div>
                )}
                <div className={`w-8 h-8 flex items-center justify-center rounded-full bg-stone-800/80 border border-stone-700 text-stone-400 transition-all duration-300 ${isExpanded ? 'rotate-180 bg-amber-500/10 border-amber-500/20 text-amber-500' : ''}`}>
                  ▼
                </div>
              </div>
            </button>
            
            {/* Smooth height transition wrapper */}
            <div 
              className={`grid transition-all duration-300 ease-in-out ${
                isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="overflow-hidden">
                <div className="border-t border-stone-800/50 bg-stone-950/30">
                  {renderContent(group.items, group)}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
