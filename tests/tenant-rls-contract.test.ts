import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260728000003_tenant_rls_policies_sec102.sql'
)
const hardeningMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260801000001_harden_profiles_rls.sql'
)

describe('tenant RLS migration contract', () => {
  it('defines organization-aware policies for protected business data', () => {
    const migration = fs.readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('organization_members')
    expect(migration).toContain('organization_id')
    expect(migration).toContain('get_user_organizations')
  })

  it('replaces deprecated profile authorization with an authenticated ownership policy', () => {
    const migration = fs.readFileSync(hardeningMigrationPath, 'utf8')

    expect(migration).toMatch(/TO authenticated/i)
    expect(migration).toMatch(/auth\.uid\(\).*id/i)
  })
})
