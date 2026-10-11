import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import manifest from './manifest'

describe('platform manifest branding', () => {
  it('serves the approved platform identity with real PNG dimensions', () => {
    const result = manifest()
    expect(result.name).toBe('Motto OIP - Restoran Zekası')
    expect(result.short_name).toBe('Motto OIP')
    expect(result.start_url).toBe('/dashboard')
    expect(result.icons?.map((icon) => icon.sizes)).toEqual(['192x192', '512x512'])
    for (const icon of result.icons ?? []) {
      expect(icon.src).toMatch(/^\/icons\/motto-oip-icon-(192|512)\.png$/)
      const file = readFileSync(path.join(process.cwd(), 'public', icon.src))
      expect(file.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
      expect(icon.sizes).toBe(`${file.readUInt32BE(16)}x${file.readUInt32BE(20)}`)
    }
  })

  it.each([
    ['src/app/apple-icon.png', 180],
    ['src/app/icon.png', 32],
  ])('ships the browser metadata asset %s at its declared size', (filePath, size) => {
    const file = readFileSync(path.join(process.cwd(), filePath))
    expect(file.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(file.readUInt32BE(16)).toBe(size)
    expect(file.readUInt32BE(20)).toBe(size)
  })
})
