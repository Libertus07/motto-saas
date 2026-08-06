import { describe, expect, it } from 'vitest'

import {
  getManagedLogoObjectPath,
  ORGANIZATION_LOGO_MAX_BYTES,
  validateOrganizationLogo,
} from './organization-logo-service'

describe('organization logo rules', () => {
  it('accepts supported images within the size limit', () => {
    expect(validateOrganizationLogo({ type: 'image/png', size: ORGANIZATION_LOGO_MAX_BYTES })).toBeNull()
  })

  it('rejects active or unsupported image formats', () => {
    expect(validateOrganizationLogo({ type: 'image/svg+xml', size: 1024 })).toContain('PNG')
  })

  it('rejects oversized images', () => {
    expect(validateOrganizationLogo({ type: 'image/jpeg', size: ORGANIZATION_LOGO_MAX_BYTES + 1 })).toContain('2 MB')
  })

  it('only extracts paths owned by the expected organization', () => {
    const url =
      'https://project.supabase.co/storage/v1/object/public/organization-branding/org-1/login%20logo.png?version=2'
    expect(getManagedLogoObjectPath(url, 'org-1')).toBe('org-1/login logo.png')
    expect(getManagedLogoObjectPath(url, 'org-2')).toBeNull()
  })
})
