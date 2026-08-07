'use client'

import React, { createContext, useCallback, useContext, useState, useEffect, useMemo } from 'react'
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
  setActiveOrg: (org: OrganizationItem) => Promise<void>
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

        const [{ data: members, error: membersError }, { data: profile, error: profileError }] = await Promise.all([
          supabase
            .from('organization_members')
            .select('organization_id, role, organizations(id, name, slug)')
            .eq('user_id', user.id)
            .eq('status', 'active'),
          supabase.from('profiles').select('active_organization_id').eq('id', user.id).maybeSingle(),
        ])

        if (membersError) throw membersError
        if (profileError) throw profileError

        if (members && members.length > 0) {
          const list: OrganizationItem[] = (members as unknown as OrganizationMember[]).map((m) => ({
            id: m.organization_id,
            name: m.organizations?.name || 'Motto Varsayılan Şube',
            slug: m.organizations?.slug || m.organization_id,
            role: m.role || 'owner',
          }))

          setOrganizations(list)

          const savedOrgId = localStorage.getItem('motto_active_org_id')
          const found =
            list.find((organization) => organization.id === profile?.active_organization_id) ||
            list.find((organization) => organization.id === savedOrgId) ||
            list[0]

          if (profile?.active_organization_id !== found.id) {
            const { error: selectionError } = await supabase.rpc('set_active_organization', {
              p_organization_id: found.id,
            })
            if (selectionError) throw selectionError
          }

          setActiveOrgState(found)
          localStorage.setItem('motto_active_org_id', found.id)
          localStorage.setItem('motto_login_org_slug', found.slug)
        } else {
          setOrganizations([])
          setActiveOrgState(null)
        }
      } catch (err) {
        console.error('Organization fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    loadOrganizations()
  }, [supabase])

  const setActiveOrg = useCallback(
    async (org: OrganizationItem) => {
      const isSelectable = organizations.some((organization) => organization.id === org.id)
      if (!isSelectable) {
        throw new Error('Bu organizasyonu seçme yetkiniz yok.')
      }

      const { error } = await supabase.rpc('set_active_organization', {
        p_organization_id: org.id,
      })
      if (error) throw error

      setActiveOrgState(org)
      localStorage.setItem('motto_active_org_id', org.id)
      localStorage.setItem('motto_login_org_slug', org.slug)
    },
    [organizations, supabase],
  )

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
