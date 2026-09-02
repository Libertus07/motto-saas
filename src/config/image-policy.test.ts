import { describe, expect, it } from 'vitest'

import { imageConfig, SUPABASE_STORAGE_HOST } from './image-policy'

describe('trusted image optimizer policy', () => {
  it('uses only exact remote hosts and storage paths', () => {
    expect(SUPABASE_STORAGE_HOST).toBe('zahdmrvhxsmqpeesrfkt.supabase.co')
    expect(imageConfig.remotePatterns).toEqual([
      {
        protocol: 'https',
        hostname: SUPABASE_STORAGE_HOST,
        port: '',
        pathname: '/storage/v1/object/**',
        search: '',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
        search: '',
      },
    ])
    expect(JSON.stringify(imageConfig)).not.toContain('**.supabase.co')
  })

  it('fails closed on redirects, large bodies, SVG, and arbitrary quality', () => {
    expect(imageConfig.maximumRedirects).toBe(0)
    expect(imageConfig.maximumResponseBody).toBe(5_000_000)
    expect(imageConfig.dangerouslyAllowSVG).toBe(false)
    expect(imageConfig.qualities).toEqual([75])
  })
})
