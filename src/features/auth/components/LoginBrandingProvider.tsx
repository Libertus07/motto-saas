'use client'

import Image from 'next/image'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { createClient } from '@/lib/supabase'

type LoginBranding = {
  businessName: string
  logoUrl: string
}

const DEFAULT_BRANDING: LoginBranding = {
  businessName: 'Motto SaaS',
  logoUrl: '/icons/logo.png',
}

const LoginBrandingContext = createContext<LoginBranding>(DEFAULT_BRANDING)

function isValidOrganizationSlug(value: string | null): value is string {
  return Boolean(value && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(value))
}

function getSafeLogoUrl(value: unknown): string {
  if (typeof value !== 'string' || !value) return DEFAULT_BRANDING.logoUrl
  if (value.startsWith('/')) return value

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return DEFAULT_BRANDING.logoUrl
  try {
    const logoUrl = new URL(value)
    const trustedOrigin = new URL(supabaseUrl).origin
    const isPublicStorageObject = logoUrl.pathname.startsWith('/storage/v1/object/public/')
    return logoUrl.origin === trustedOrigin && isPublicStorageObject ? logoUrl.toString() : DEFAULT_BRANDING.logoUrl
  } catch {
    return DEFAULT_BRANDING.logoUrl
  }
}

export function LoginBrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<LoginBranding>(DEFAULT_BRANDING)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let cancelled = false

    async function loadBranding() {
      const querySlug = new URLSearchParams(window.location.search).get('organization')
      const savedSlug = window.localStorage.getItem('motto_login_org_slug')
      const organizationSlug = isValidOrganizationSlug(querySlug)
        ? querySlug
        : isValidOrganizationSlug(savedSlug)
          ? savedSlug
          : null

      if (!organizationSlug) return
      if (isValidOrganizationSlug(querySlug)) {
        window.localStorage.setItem('motto_login_org_slug', querySlug)
      }

      const { data, error } = await supabase
        .rpc('get_public_login_branding', { p_organization_slug: organizationSlug })
        .maybeSingle()
      if (cancelled || error || !data) return

      const row = data as { business_logo: unknown; business_name: unknown }
      setBranding({
        businessName:
          typeof row.business_name === 'string' && row.business_name.trim()
            ? row.business_name.trim().slice(0, 80)
            : DEFAULT_BRANDING.businessName,
        logoUrl: getSafeLogoUrl(row.business_logo),
      })
    }

    void loadBranding()
    return () => {
      cancelled = true
    }
  }, [supabase])

  return <LoginBrandingContext.Provider value={branding}>{children}</LoginBrandingContext.Provider>
}

export function useLoginBranding() {
  return useContext(LoginBrandingContext)
}

export function LoginBrandLogo({ className }: { className: string }) {
  const { businessName, logoUrl } = useLoginBranding()

  return (
    <Image
      src={logoUrl}
      alt={`${businessName} logosu`}
      width={96}
      height={96}
      priority
      unoptimized
      className={className}
    />
  )
}
