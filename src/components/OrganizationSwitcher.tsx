'use client'

import { useState } from 'react'
import { useOrganization, OrganizationItem } from '@/context/OrganizationContext'

export function OrganizationSwitcher() {
  const { activeOrg, organizations, loading, setActiveOrg } = useOrganization()
  const [isOpen, setIsOpen] = useState(false)

  const handleSelectOrg = (org: OrganizationItem) => {
    setActiveOrg(org)
    setIsOpen(false)
  }

  if (loading) {
    return <div className="h-7 w-32 bg-stone-800/60 rounded-xl animate-pulse border border-stone-800" />
  }

  return (
    <div className="relative block min-w-0 max-w-full text-left">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label="Şube ve organizasyon seçici"
        className="flex min-h-[44px] md:min-h-0 w-full min-w-0 items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-950/80 border border-stone-800 hover:border-amber-500/40 text-xs font-bold text-stone-200 hover:text-amber-400 transition-all shadow-inner"
      >
        <span className="w-2 h-2 shrink-0 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{activeOrg?.name || 'Şube Seç'}</span>
        <span className="shrink-0 text-[10px] text-stone-500" aria-hidden="true">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Şube Listesi"
          className="absolute left-0 mt-2 w-56 rounded-2xl bg-stone-900 border border-stone-800 shadow-2xl z-50 overflow-hidden backdrop-blur-xl animate-fadeIn p-1.5"
        >
          <div className="px-3 py-2 text-[10px] font-black uppercase text-stone-500 tracking-wider border-b border-stone-800/80 mb-1">
            Şubelerim & Organizasyonlar
          </div>
          {organizations.map((org) => (
            <button
              key={org.id}
              onClick={() => handleSelectOrg(org)}
              className={`min-h-[44px] md:min-h-0 w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all text-left ${
                activeOrg?.id === org.id
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'text-stone-300 hover:bg-stone-800/60 hover:text-white'
              }`}
            >
              <span className="truncate">{org.name}</span>
              <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-stone-800 text-stone-400">
                {org.role}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
