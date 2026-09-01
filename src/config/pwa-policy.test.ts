import { describe, expect, it } from 'vitest'

import { excludeFrontendNavigationWorkerFromPrecache } from './pwa-policy'

describe('PWA precache policy', () => {
  it('keeps the navigation worker network-addressable without precaching a redirected HTML response', async () => {
    const result = await excludeFrontendNavigationWorkerFromPrecache([
      { url: '/swe-worker-5c72df51bb1f6ee0.js', revision: 'worker' },
      { url: '/_next/static/chunks/app.js', revision: 'app' },
      { url: '/icons/logo.png', revision: 'logo' },
      { url: '/swe-worker-admin.js', revision: 'protected-route' },
      { url: '/nested/swe-worker-5c72df51bb1f6ee0.js', revision: 'nested' },
      { url: '/swe-worker-5c72df51bb1f6ee0.js?v=1', revision: 'query' },
    ])

    expect(result.manifest).toEqual([
      { url: '/_next/static/chunks/app.js', revision: 'app' },
      { url: '/icons/logo.png', revision: 'logo' },
      { url: '/swe-worker-admin.js', revision: 'protected-route' },
      { url: '/nested/swe-worker-5c72df51bb1f6ee0.js', revision: 'nested' },
      { url: '/swe-worker-5c72df51bb1f6ee0.js?v=1', revision: 'query' },
    ])
    expect(result.warnings).toEqual([])
  })
})
