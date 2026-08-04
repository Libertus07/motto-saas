import { describe, expect, it } from 'vitest'
import { calculatePasswordStrength } from './account-security'

describe('calculatePasswordStrength', () => {
  it('returns zero for an empty password', () => {
    expect(calculatePasswordStrength('')).toBe(0)
  })

  it('caps a strong password at the highest supported score', () => {
    expect(calculatePasswordStrength('Motto-SaaS-2026!')).toBe(4)
  })
})
