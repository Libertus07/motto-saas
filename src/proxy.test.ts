import { describe, expect, it } from 'vitest'

import { config } from './proxy'

describe('proxy public asset boundary', () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`)

  it.each(['/sw.js', '/workbox-f1770938.js', '/swe-worker-5c72df51bb1f6ee0.js'])(
    'keeps the generated PWA asset %s outside authentication redirects',
    (path) => {
      expect(matcher.test(path)).toBe(false)
    },
  )

  it('continues to protect application routes', () => {
    expect(matcher.test('/dashboard')).toBe(true)
    expect(matcher.test('/dashboard/raporlar')).toBe(true)
    expect(matcher.test('/swe-worker-admin')).toBe(true)
    expect(matcher.test('/swe-worker-admin.js')).toBe(true)
    expect(matcher.test('/workbox-admin.js')).toBe(true)
    expect(matcher.test('/swe-worker-not-a-hash.js')).toBe(true)
    expect(matcher.test('/assets/swe-worker-5c72df51bb1f6ee0.js')).toBe(true)
    expect(matcher.test('/swe-worker-admin.js/settings')).toBe(true)
  })
})
