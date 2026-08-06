'use client'

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

export interface OrganizationItem {
  id: string
  name: string
  slug: string
  role: string
}

type OrganizationMember = {
  organization_id: string
  role: string | null
  organizations: { name: string; slug: string } | null
}

interface OrganizationContextType {
  activeOrg: OrganizationItem | null
  organizations: OrganizationItem[]
  loading: boolean
  setActiveOrg: (org: OrganizationItem) => void
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined)

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([])
  const [activeOrg, setActiveOrgState] = useState<OrganizationItem | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadOrganizations() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }

        const { data: members } = await supabase
          .from('organization_members')
          .select('organization_id, role, organizations(id, name, slug)')
          .eq('user_id', user.id)
          .eq('status', 'active')

        if (members && members.length > 0) {
          const list: OrganizationItem[] = (members as unknown as OrganizationMember[]).map((m) => ({
            id: m.organization_id,
            name: m.organizations?.name || 'Motto Varsayılan Şube',
            slug: m.organizations?.slug || m.organization_id,
            role: m.role || 'owner',
          }))

          setOrganizations(list)

          const savedOrgId = localStorage.getItem('motto_active_org_id')
          const found = list.find((o) => o.id === savedOrgId) || list[0]
          setActiveOrgState(found)
          localStorage.setItem('motto_login_org_slug', found.slug)
          if (!savedOrgId) {
            localStorage.setItem('motto_active_org_id', found.id)
          }
        } else {
          // Legacy fallback
          const defaultOrg: OrganizationItem = {
            id: '00000000-0000-0000-0000-000000000001',
            name: 'Motto SaaS (Ana Şube)',
            slug: 'motto-saas',
            role: 'owner',
          }
          setOrganizations([defaultOrg])
          setActiveOrgState(defaultOrg)
          localStorage.setItem('motto_login_org_slug', defaultOrg.slug)
        }
      } catch (err) {
        console.error('Organization fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    loadOrganizations()
  }, [supabase])

  const setActiveOrg = (org: OrganizationItem) => {
    setActiveOrgState(org)
    localStorage.setItem('motto_active_org_id', org.id)
    localStorage.setItem('motto_login_org_slug', org.slug)
  }

  return (
    <OrganizationContext.Provider value={{ activeOrg, organizations, loading, setActiveOrg }}>
      {children}
    </OrganizationContext.Provider>
  )
}

export function useOrganization() {
  const context = useContext(OrganizationContext)
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider')
  }
  return context
}
