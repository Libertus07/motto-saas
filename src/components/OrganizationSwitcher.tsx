'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export interface OrganizationItem {
  id: string
  name: string
  role: string
}

export function OrganizationSwitcher() {
  const supabase = createClient()
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([])
  const [activeOrg, setActiveOrg] = useState<OrganizationItem | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadOrganizations() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }

        const { data: members } = await supabase
          .from('organization_members')
          .select('organization_id, role, organizations(id, name)')
          .eq('user_id', user.id)
          .eq('status', 'active')

        if (members && members.length > 0) {
          const list: OrganizationItem[] = members.map((m: any) => ({
            id: m.organization_id,
            name: m.organizations?.name || 'Motto Varsayılan Şube',
            role: m.role || 'owner'
          }))

          setOrganizations(list)

          const savedOrgId = localStorage.getItem('motto_active_org_id')
          const found = list.find(o => o.id === savedOrgId) || list[0]
          setActiveOrg(found)
          if (!savedOrgId) {
            localStorage.setItem('motto_active_org_id', found.id)
          }
        } else {
          // Legacy fallback
          const defaultOrg: OrganizationItem = {
            id: '00000000-0000-0000-0000-000000000001',
            name: 'Motto SaaS (Ana Şube)',
            role: 'owner'
          }
          setOrganizations([defaultOrg])
          setActiveOrg(defaultOrg)
        }
      } catch (err) {
        console.error('Organization fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    loadOrganizations()
  }, [])

  const handleSelectOrg = (org: OrganizationItem) => {
    setActiveOrg(org)
    localStorage.setItem('motto_active_org_id', org.id)
    setIsOpen(false)
    window.location.reload()
  }

  if (loading) {
    return (
      <div className="h-7 w-32 bg-stone-800/60 rounded-xl animate-pulse border border-stone-800" />
    )
  }

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label="Şube ve organizasyon seçici"
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-950/80 border border-stone-800 hover:border-amber-500/40 text-xs font-bold text-stone-200 hover:text-amber-400 transition-all shadow-inner"
      >
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
        <span className="truncate max-w-[120px] sm:max-w-[160px]">{activeOrg?.name || 'Şube Seç'}</span>
        <span className="text-[10px] text-stone-500" aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
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
          {organizations.map(org => (
            <button
              key={org.id}
              onClick={() => handleSelectOrg(org)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all text-left ${
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
