import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const ciWorkflow = fs.readFileSync(path.resolve('.github/workflows/ci.yml'), 'utf8')
const productionWorkflow = fs.readFileSync(path.resolve('.github/workflows/production-database-deploy.yml'), 'utf8')

describe('GitHub Actions security contract', () => {
  it('keeps pull-request jobs read-only and free of live Supabase secrets', () => {
    expect(ciWorkflow).toMatch(/^permissions:\s*\n\s+contents: read$/m)
    expect(ciWorkflow).not.toContain('${{ secrets.')
    expect(ciWorkflow).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('requires a trusted backup attestation in both Production jobs', () => {
    expect(productionWorkflow).toContain('backup_attestation:')
    expect(productionWorkflow.match(/VALIDATION_PHASE: trusted/g)).toHaveLength(2)
    expect(productionWorkflow.match(/PRODUCTION_BACKUP_ATTESTATION_KEY/g)).toHaveLength(2)
    expect(productionWorkflow.match(/BACKUP_ATTESTATION: \$\{\{ inputs\.backup_attestation \}\}/g)).toHaveLength(2)
  })
})
