import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { main, runSyntheticScenario } from './synthetic-cli.mjs'

describe('fixture-only CLI boundary', () => {
  it.each(
    [
      [],
      ['--scenario'],
      ['--scenario', 'production'],
      ['--url', 'https://example.test'],
      ['--scenario', 'C:/secrets'],
      ['--scenario', 'happy', '--token', 'SECRET'],
      ['--scenario', 'https://example.test'],
    ].map((args) => ({ args })),
  )('rejects unsupported arguments $args', async ({ args }) => {
    let output = ''
    expect(
      await main(args, {
        write: (value: string) => {
          output += value
        },
      }),
    ).toBe(2)
    expect(JSON.parse(output)).toEqual({
      status: 'INCOMPLETE',
      code: 'INVALID_ARGUMENTS',
      totals: { objects: 0, bytes: 0 },
      evidenceLevel: 'synthetic',
      productionReady: false,
      physicalBytesVerifiedInProduction: false,
    })
    expect(output).not.toMatch(/SECRET|https|secrets/)
  })
  it.each([
    ['happy', 0, 'COMPLETE'],
    ['mutation', 1, 'INCOMPLETE'],
    ['checksum-mismatch', 1, 'INCOMPLETE'],
    ['interrupted-resume', 0, 'COMPLETE'],
  ] as const)('runs %s with expected status', async (name, exit, status) => {
    let output = ''
    expect(
      await main(['--scenario', name], {
        write: (value: string) => {
          output += value
        },
      }),
    ).toBe(exit)
    const value = JSON.parse(output)
    expect(value.status).toBe(status)
    expect(Object.keys(value).sort()).toEqual([
      'code',
      'evidenceLevel',
      'physicalBytesVerifiedInProduction',
      'productionReady',
      'status',
      'totals',
    ])
    expect(output).not.toMatch(/fixture|pdf|secret|stack|cause|backup-sets/)
    expect(value.evidenceLevel).toBe('synthetic')
    expect(value.productionReady).toBe(false)
  })
  it('refuses arbitrary scenario input directly', async () => {
    expect((await runSyntheticScenario('SECRET')).code).toBe('INVALID_ARGUMENTS')
  })
  it('has no import-time output and ignores hostile environment configuration', () => {
    const imported = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', "await import('./scripts/security/storage-backup/synthetic-cli.mjs')"],
      { encoding: 'utf8' },
    )
    expect(imported.status).toBe(0)
    expect(imported.stdout + imported.stderr).toBe('')
    const child = spawnSync(
      process.execPath,
      ['scripts/security/storage-backup/synthetic-cli.mjs', '--scenario', 'happy'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          AWS_ACCESS_KEY_ID: 'DUMMY_SECRET_CANARY',
          SUPABASE_URL: 'https://production.invalid',
          DATABASE_URL: 'DUMMY_DATABASE_SECRET',
        },
      },
    )
    expect(child.status).toBe(0)
    expect(JSON.parse(child.stdout).status).toBe('COMPLETE')
    expect(child.stdout + child.stderr).not.toMatch(/DUMMY|production.invalid/)
  })
  it('allows only local modules and pure builtins through the transitive import boundary', () => {
    const seen = new Set<string>()
    function visit(path: string) {
      if (seen.has(path)) return
      seen.add(path)
      const code = readFileSync(path, 'utf8')
      expect(code).not.toMatch(/process\s*(?:\.\s*env|\[\s*['"]env)|\bfetch\s*\(|\brequire\s*\(|\bimport\s*\(/)
      for (const match of code.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) {
        const specifier = match[1]
        if (specifier.startsWith('.')) visit(resolve(dirname(path), specifier))
        else expect(['node:crypto', 'node:path', 'node:url']).toContain(specifier)
      }
    }
    visit(resolve('scripts/security/storage-backup/synthetic-cli.mjs'))
    expect(seen.size).toBe(6)
  })
})
